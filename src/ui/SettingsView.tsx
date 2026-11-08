import { t, setLang } from '@/i18n'
import { useRef, useState } from 'react'
import { version as appVersion } from '../../package.json'
import {
  BackupCryptoError,
  assertPassword,
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
  validateBackup,
} from 'shisui-core'
import { useApp } from '@/state/store'
import { downloadTextFile } from '@/services/download'
import { DEFAULT_LLM_CONFIG, isLLMReady, type LLMConfig } from '@/services/llm'

interface RestorePreview {
  text: string
  tasks: number
  series: number
  batches: number
  exportedAt: string
}

export default function SettingsView() {
  const llmConfig = useApp((s) => s.llmConfig)
  const saveLLM = useApp((s) => s.saveLLM)
  const exportBackup = useApp((s) => s.exportBackup)
  const restoreBackup = useApp((s) => s.restoreBackup)
  const lang = useApp((s) => s.lang)
  const setAppLang = useApp((s) => s.setLang)
  const changeLang = (next: 'zh' | 'en') => {
    setAppLang(next)
    setLang(next)
    document.title = next === 'en' ? 'Shisui — turn group messages into to-dos' : '拾穗 · 群消息变待办'
  }
  const [draft, setDraft] = useState<LLMConfig>(llmConfig)
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [encrypt, setEncrypt] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pendingEncrypted, setPendingEncrypted] = useState<string | null>(null)
  const [decryptPassword, setDecryptPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    saveLLM(draft)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  const handleExport = async () => {
    setError(null)
    setDone(null)
    const stamp = new Date().toISOString().slice(0, 10)
    let text = exportBackup()
    if (encrypt) {
      try {
        assertPassword(password)
      } catch (err) {
        setError(err instanceof BackupCryptoError ? err.message : t('密码不合法'))
        return
      }
      if (password !== confirm) {
        setError(t('两次输入的密码不一致'))
        return
      }
      setBusy(true)
      try {
        text = JSON.stringify(await encryptBackup(text, password))
      } finally {
        setBusy(false)
      }
      setPassword('')
      setConfirm('')
    }
    const suffix = encrypt ? 'encrypted' : 'backup'
    downloadTextFile(text, `shisui-${suffix}-${stamp}.json`, 'application/json;charset=utf-8')
    setDone(encrypt ? t('加密备份已下载（密码请自己记住，丢了无法恢复）') : t('备份已下载'))
  }

  const handlePick = async (file: File) => {
    setError(null)
    setDone(null)
    const text = await file.text()
    if (isEncryptedBackup(text)) {
      setPreview(null)
      setPendingEncrypted(text)
      setDecryptPassword('')
      setError(null)
      return
    }
    setPendingEncrypted(null)
    const result = validateBackup(text)
    if (!result.ok || !result.backup) {
      setPreview(null)
      setError(result.errors[0] ?? t('备份文件不合法'))
      return
    }
    setPreview({
      text,
      tasks: result.backup.tasks.length,
      series: result.backup.series.length,
      batches: result.backup.batches.length,
      exportedAt: result.backup.exportedAt,
    })
  }

  const handleDecryptPreview = async () => {
    if (!pendingEncrypted) return
    setError(null)
    setBusy(true)
    try {
      const plaintext = await decryptBackup(pendingEncrypted, decryptPassword)
      const result = validateBackup(plaintext)
      if (!result.ok || !result.backup) {
        setError(result.errors[0] ?? t('解密后的备份不合法'))
        return
      }
      setPendingEncrypted(null)
      setDecryptPassword('')
      setPreview({
        text: plaintext,
        tasks: result.backup.tasks.length,
        series: result.backup.series.length,
        batches: result.backup.batches.length,
        exportedAt: result.backup.exportedAt,
      })
    } catch (err) {
      setError(err instanceof BackupCryptoError ? err.message : t('解密失败'))
    } finally {
      setBusy(false)
    }
  }

  const confirmRestore = async () => {
    if (!preview) return
    const result = await restoreBackup(preview.text)
    setPreview(null)
    if (!result.ok) {
      setError(result.errors[0] ?? t('恢复失败'))
      return
    }
    setDone(t('已恢复 {n} 条任务、{series} 个系列', { n: result.counts?.tasks ?? 0, series: result.counts?.series ?? 0 }))
  }

  return (
    <div className="settings">
      <section className="card" aria-labelledby="language-title">
        <h3 id="language-title">{t('界面语言')}</h3>
        <div className="language-switch">
          <button
            type="button"
            className={`btn btn-sm ${lang === 'zh' ? 'btn-primary' : ''}`}
            onClick={() => changeLang('zh')}
          >
            {t('中文')}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${lang === 'en' ? 'btn-primary' : ''}`}
            onClick={() => changeLang('en')}
          >
            {t('English')}
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="backup-title">
        <h3 id="backup-title">{t('备份与恢复')}</h3>
        <p className="muted">
          {t('备份是一个 JSON 文件，包含全部任务、重复系列和历史记录。')}
          <strong>{t('恢复会覆盖当前全部数据')}</strong>{t('，先下载一份再恢复最稳。')}
          {t('文件不加密（备份里没有 AI Key，但可能含通知原文），请自己保管好。')}
        </p>
        <label className="inline-check backup-encrypt">
          <input type="checkbox" checked={encrypt} onChange={(event) => setEncrypt(event.target.checked)} />
          {t('加密备份（密码至少 8 位，丢失密码无法恢复）')}
        </label>
        {encrypt && (
          <div className="backup-password">
            <label className="field block">
              <span>{t('密码')}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-label={t('备份密码')}
                autoComplete="new-password"
              />
            </label>
            <label className="field block">
              <span>{t('再输一次')}</span>
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                aria-label={t('确认备份密码')}
                autoComplete="new-password"
              />
            </label>
          </div>
        )}
        <div className="backup-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleExport()}>
            {t('导出 JSON 备份')}
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {t('选择备份文件恢复')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void handlePick(file)
            }}
          />
        </div>

        {pendingEncrypted && (
          <div className="restore-preview" role="region" aria-label={t('加密备份解锁')}>
            <p>{t('这是加密备份，输入导出时设置的密码来解锁。')}</p>
            <label className="field block">
              <span>{t('密码')}</span>
              <input
                type="password"
                value={decryptPassword}
                onChange={(event) => setDecryptPassword(event.target.value)}
                aria-label={t('解密密码')}
                autoComplete="off"
              />
            </label>
            <div className="backup-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleDecryptPreview()}>
                {t('解密并预览')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPendingEncrypted(null)}>
                {t('取消')}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="import-error" role="alert">
            {error}
          </p>
        )}
        {done && <p className="import-ok">{done}</p>}

        {preview && (
          <div className="restore-preview" role="region" aria-label={t('恢复预览')}>
            <p>
              {t('这份备份导出时间：{time}，含 {tasks} 条任务、{series} 个重复系列、{batches} 条历史。', {
                time: new Date(preview.exportedAt).toLocaleString(),
                tasks: preview.tasks,
                series: preview.series,
                batches: preview.batches,
              })}
            </p>
            <p className="muted">{t('确认后会清空当前数据并替换，不可撤销。')}</p>
            <div className="backup-actions">
              <button type="button" className="btn btn-danger" onClick={() => void confirmRestore()}>
                {t('确认恢复')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                {t('取消')}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h3>{t('AI 增强引擎（可选）')}</h3>
        <p className="muted">
          {t('填任意 OpenAI 兼容接口即可启用双引擎。不填也能用：规则引擎离线完成全部解析，只是对特别绕的写法容错更低。')}
          {t('Key 只保存在你自己的 localStorage，请求直接发给你填的服务商。')}
        </p>

        <label className="field block">
          <span>{t('接口地址')}</span>
          <input
            value={draft.endpoint}
            onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })}
            placeholder={DEFAULT_LLM_CONFIG.endpoint}
            spellCheck={false}
          />
        </label>

        <label className="field block">
          <span>{t('模型')}</span>
          <input
            value={draft.model}
            onChange={(event) => setDraft({ ...draft, model: event.target.value })}
            placeholder={DEFAULT_LLM_CONFIG.model}
            spellCheck={false}
          />
        </label>

        <label className="field block">
          <span>{t('API Key')}</span>
          <input
            type="password"
            value={draft.apiKey}
            onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
            placeholder="sk-..."
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        <div className="settings-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            {saved ? t('已保存') : t('保存')}
          </button>
          <span className="muted">{isLLMReady(draft) ? t('已配置：解析时会尝试 AI，失败自动降级') : t('未配置：只用规则引擎')}</span>
        </div>
      </section>

      <section className="card">
        <h3>{t('关于拾穗')}</h3>
        <p className="muted">拾穗 v{appVersion} · AGPL-3.0-or-later</p>
        <p className="muted">
          {t('默认不联网：数据只存在你自己的浏览器 IndexedDB 里；没有账号、没有服务器、不上传。')}{' '}
          {t('唯一会出网的情况是你自己配置了 AI 接口并触发解析。')}
        </p>
        <p className="muted about-author">{t('作者：dream-office')}</p>
        <p className="about-signature">{t('dream-office · 把散落的时间，一粒一粒捡起来。')}</p>
        <p className="muted">
          <a href="https://github.com/dream-office/shisui" target="_blank" rel="noreferrer">
            {t('源码（GitHub）')}
          </a>
        </p>
      </section>
    </div>
  )
}
