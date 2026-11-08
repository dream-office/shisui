import { useRef, useState } from 'react'
import { t } from '@/i18n'
import { useApp } from '@/state/store'
import { isLLMReady } from '@/services/llm'
import { parseImageWithLLM } from '@/services/llm'
import { compressImage, recognizeLocalImage } from '@/services/imageImport'
import { extractDocumentText } from '@/services/documentImport'
import { ImportError, type ImportErrorCode, validateImage } from '@/services/fileLimits'

interface Props {
  onText: (text: string) => void
}

const ERROR_KEYS: Record<ImportErrorCode, string> = {
  'unsupported-type': '该格式暂不支持',
  'legacy-office': '旧版 Office 格式暂不支持，请另存为 .docx / .txt / .md 后再导入',
  'too-large': '文件太大（文档最大 20MB，图片最大 10MB）',
  empty: '文件里没有可识别的文字',
  'scanned-pdf': '扫描版 PDF 暂时不支持，请拍照或截图后用图片识别',
  'pdf-failed': 'PDF 读取失败，请确认文件没有加密或损坏',
  'docx-failed': 'DOCX 读取失败，请确认文件没有损坏',
  'read-failed': '文件读取失败，请重试',
  'ocr-failed': '本地识别失败，请重试或换一张更清晰的图片',
  'ai-unavailable': '未配置 AI 接口，无法使用 AI 识图',
  'ai-unsupported-vision': '当前模型可能不支持图片识别，请换支持视觉的模型',
  'ai-failed': 'AI 识图失败，请检查网络与接口配置',
  cancelled: '已取消',
}

export default function ImportPanel({ onText }: Props) {
  const imageMode = useApp((s) => s.imageMode)
  const llmConfig = useApp((s) => s.llmConfig)
  const setImageCandidates = useApp((s) => s.setImageCandidates)
  const docInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [ocrNoticeOpen, setOcrNoticeOpen] = useState(false)
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false)
  const [aiChecked, setAiChecked] = useState(false)

  const aiReady = isLLMReady(llmConfig)
  const lowMemory =
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number' &&
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) < 4
  const showError = (code: ImportErrorCode) => setError(t(ERROR_KEYS[code] ?? '操作失败，请重试'))
  const reset = () => {
    setError(null)
    setStatus(null)
  }

  const handleDocument = async (file: File) => {
    reset()
    setBusy(true)
    setStatus(t('正在读取文档…'))
    try {
      const result = await extractDocumentText(file)
      onText(result.text)
      setStatus(
        result.truncated
          ? t('文档已导入并截断到 5 万字：{name}', { name: file.name })
          : t('文档已导入：{name}', { name: file.name }),
      )
    } catch (err) {
      showError(err instanceof ImportError ? err.code : 'read-failed')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const runOcr = async (file: File) => {
    reset()
    setBusy(true)
    setStatus(t('正在本地识别（首次需加载语言包，约 5–10MB，请稍候）…'))
    try {
      const result = await recognizeLocalImage(file, (phase, progress) => {
        setStatus(`${t('正在本地识别…')} ${phase} ${Math.round(progress * 100)}%`)
      })
      onText(result.text)
      setStatus(result.truncated ? t('本地识别完成，文本已截断到 5 万字') : t('本地识别完成，已填入收件框'))
    } catch (err) {
      showError(err instanceof ImportError ? err.code : 'ocr-failed')
      setStatus(null)
    } finally {
      setBusy(false)
      setPendingImage(null)
      setOcrNoticeOpen(false)
    }
  }

  const runAi = async (file: File) => {
    reset()
    if (!aiReady) {
      showError('ai-unavailable')
      return
    }
    setBusy(true)
    setStatus(t('正在调用 AI 识图…'))
    try {
      const { dataUrl } = await compressImage(file)
      const tasks = await parseImageWithLLM(dataUrl, new Date(), llmConfig)
      setImageCandidates(tasks)
      setStatus(tasks.length > 0 ? t('图片识别完成，请核对候选') : t('图片里没有识别出可用的待办'))
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      showError(message === 'AI_MODEL_NO_VISION' ? 'ai-unsupported-vision' : 'ai-failed')
      setStatus(null)
    } finally {
      setBusy(false)
      setPendingImage(null)
      setAiConfirmOpen(false)
      setAiChecked(false)
    }
  }

  const openOcr = (file: File) => {
    if (window.localStorage.getItem('shisui.ocr-notice-ok') === '1') {
      void runOcr(file)
    } else {
      setPendingImage(file)
      setOcrNoticeOpen(true)
    }
  }

  const chooseImage = (file: File) => {
    reset()
    const validation = validateImage(file)
    if (validation) {
      showError(validation)
      return
    }
    if (imageMode === 'off') {
      showError('unsupported-type')
      return
    }
    if (imageMode === 'ask') {
      setPendingImage(file)
      setAskOpen(true)
      return
    }
    if (imageMode === 'local') {
      openOcr(file)
      return
    }
    if (!aiReady) {
      showError('ai-unavailable')
      return
    }
    setPendingImage(file)
    setAiChecked(false)
    setAiConfirmOpen(true)
  }

  return (
    <div className="import-panel">
      <div className="import-actions">
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => docInput.current?.click()}
        >
          {t('导入文档')}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy || imageMode === 'off' || (imageMode === 'ai' && !aiReady)}
          title={
            imageMode === 'off'
              ? t('图片识别已关闭')
              : imageMode === 'ai' && !aiReady
                ? t('未配置 AI 接口，无法使用 AI 识图')
                : undefined
          }
          onClick={() => imageInput.current?.click()}
        >
          {t('识别图片')}
        </button>
        <span className="muted import-hint">{t('PDF / DOCX / TXT / MD · 图片 png/jpg/webp')}</span>
      </div>
      <input
        ref={docInput}
        type="file"
        accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void handleDocument(file)
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) chooseImage(file)
        }}
      />
      {status && <p className="import-ok" role="status">{status}</p>}
      {error && <p className="import-error" role="alert">{error}</p>}

      {askOpen && pendingImage && (
        <div className="help-overlay" role="presentation" onClick={() => setAskOpen(false)}>
          <section className="import-modal card" role="dialog" aria-modal="true" aria-label={t('选择图片识别方式')} onClick={(e) => e.stopPropagation()}>
            <h3>{t('选择图片识别方式')}</h3>
            <p className="muted">{t('本地 OCR 不上传；AI 识图会把图片发送到你配置的服务。')}</p>
            <div className="import-modal-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setAskOpen(false)
                  openOcr(pendingImage)
                }}
              >
                {t('本地 OCR（离线）')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!aiReady}
                title={!aiReady ? t('未配置 AI 接口，无法使用 AI 识图') : undefined}
                onClick={() => {
                  setAskOpen(false)
                  setAiChecked(false)
                  setAiConfirmOpen(true)
                }}
              >
                {t('AI 识图（发送到 API）')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAskOpen(false)}>
                {t('取消')}
              </button>
            </div>
          </section>
        </div>
      )}

      {ocrNoticeOpen && pendingImage && (
        <div className="help-overlay" role="presentation">
          <section className="import-modal card" role="dialog" aria-modal="true" aria-label={t('本地识别说明')}>
            <h3>{t('本地识别说明')}</h3>
            <ul className="import-notice-list">
              <li>{t('在设备本地运行，不上传图片或识别结果。')}</li>
              <li>{t('首次使用需下载语言包（约 5–10MB），缓存后可离线。')}</li>
              <li>{t('占用内存；单页识别约 2–8 秒（桌面）/ 5–15 秒（手机），低端设备可能卡顿。')}</li>
              <li>{t('手写、暗光、复杂排版识别率有限，请人工核对后再收录。')}</li>
              {lowMemory && <li className="import-warn">{t('设备内存较低，建议改用 AI 识图（不强制）。')}</li>}
            </ul>
            <div className="import-modal-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  window.localStorage.setItem('shisui.ocr-notice-ok', '1')
                  void runOcr(pendingImage)
                }}
              >
                {t('同意并开始识别')}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setOcrNoticeOpen(false)
                  setPendingImage(null)
                  void Promise.resolve()
                }}
              >
                {t('取消')}
              </button>
            </div>
          </section>
        </div>
      )}

      {aiConfirmOpen && pendingImage && (
        <div className="help-overlay" role="presentation">
          <section className="import-modal card" role="dialog" aria-modal="true" aria-label={t('确认发送图片')}>
            <h3>{t('确认发送图片')}</h3>
            <p>{t('图片将发送到你配置的 AI 服务，用于识别文字并抽取待办。')}</p>
            <label className="inline-check">
              <input type="checkbox" checked={aiChecked} onChange={(e) => setAiChecked(e.target.checked)} />
              {t('我确认发送这张图片')}
            </label>
            <div className="import-modal-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!aiChecked || busy}
                onClick={() => void runAi(pendingImage)}
              >
                {t('发送并识别')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAiConfirmOpen(false)}>
                {t('取消')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
