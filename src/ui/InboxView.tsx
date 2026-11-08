import { t } from '@/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { appendClipboardText } from 'shisui-core'
import { useApp } from '@/state/store'
import { SAMPLE_NOTICE, SAMPLE_WORK } from 'shisui-core'
import BatchPreview from './BatchPreview'
import CandidateCard from './CandidateCard'
import HistoryPanel from './HistoryPanel'
import IcsImportPanel from './IcsImportPanel'
import ManualAddForm from './ManualAddForm'
import EmptyState from './EmptyState'
import ImportPanel from './ImportPanel'
import { useNow } from './useNow'

/**
 * 读取 PWA 分享目标传进来的参数（Chrome/Android 支持；iOS 不支持，见 README）。
 * 清掉 query 用 replaceState：避免刷新重复触发、也避免把别人的分享内容留在地址栏。
 */
function takeSharedText(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const text = params.get('text') ?? ''
  const title = params.get('title') ?? ''
  const url = params.get('url') ?? ''
  const composed = [title, text, url].filter((part) => part.trim().length > 0).join('\n')
  if (!composed) return null
  window.history.replaceState(null, '', window.location.pathname)
  return composed
}

export default function InboxView() {
  const [raw, setRaw] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [showFirstVisit, setShowFirstVisit] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('shisui-help-banner-seen') !== '1'
    } catch {
      return false
    }
  })

  const dismissFirstVisit = () => {
    try {
      window.localStorage.setItem('shisui-help-banner-seen', '1')
    } catch {
      // 隐私模式禁用 localStorage 时忽略：本次关闭即可
    }
    setShowFirstVisit(false)
  }

  /** iOS 没有系统分享目标：用户复制内容后点这里读取剪贴板，追加到输入末尾（不覆盖） */
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setPasteError(t('剪贴板里没有文字，先复制群消息再点一次'))
        return
      }
      setRaw((prev) => appendClipboardText(prev, text))
      setPasteError(null)
    } catch {
      setPasteError(t('浏览器不允许读取剪贴板，请长按输入框手动粘贴'))
    }
  }
  const [manualOpen, setManualOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [icsOpen, setIcsOpen] = useState(false)
  const [sharedFrom, setSharedFrom] = useState<string | null>(null)
  const history = useApp((s) => s.history)
  const candidates = useApp((s) => s.candidates)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const batchMode = useApp((s) => s.batchMode)

  // 「本周日」当天会产出本周/下周两个候选：同组默认选「本周」，UI 里可切换
  const choiceGroups = useMemo(() => {
    const groups = new Map<string, typeof candidates>()
    for (const task of candidates) {
      if (!task.choiceGroup) continue
      const list = groups.get(task.choiceGroup) ?? []
      list.push(task)
      groups.set(task.choiceGroup, list)
    }
    return groups
  }, [candidates])

  const [choiceSelection, setChoiceSelection] = useState<Record<string, string>>({})

  useEffect(() => {
    setChoiceSelection((current) => {
      const next: Record<string, string> = {}
      choiceGroups.forEach((groupTasks, group) => {
        const existing = current[group]
        if (existing && groupTasks.some((task) => task.id === existing)) {
          next[group] = existing
          return
        }
        const preferred = groupTasks.find((task) => task.choiceLabel === '本周') ?? groupTasks[0]
        next[group] = preferred.id
      })
      return next
    })
  }, [choiceGroups])

  const visibleCandidates = candidates.filter(
    (task) => !task.choiceGroup || choiceSelection[task.choiceGroup] === task.id,
  )

  // 启动时只取一次：分享过来的内容填进输入框，并提示来源
  useEffect(() => {
    const shared = takeSharedText()
    if (!shared) return
    setRaw(shared)
    setSharedFrom('分享内容')
  }, [])
  const parsing = useApp((s) => s.parsing)
  const stage = useApp((s) => s.stage)
  const engineNote = useApp((s) => s.engineNote)
  const warnings = useApp((s) => s.warnings)
  const parse = useApp((s) => s.parse)
  const acceptCandidates = useApp((s) => s.acceptCandidates)
  const dismissCandidate = useApp((s) => s.dismissCandidate)
  const updateCandidate = useApp((s) => s.updateCandidate)
  const now = useNow(15_000)
  const [accepted, setAccepted] = useState(0)

  const handleParse = async () => {
    setAccepted(0)
    await parse(raw)
  }

  const acceptAll = async () => {
    const ids = visibleCandidates.map((task) => task.id)
    await acceptCandidates(ids)
    setAccepted((n) => n + ids.length)
  }

  return (
    <div className="inbox">
      {showFirstVisit && (
        <div className="first-visit card" role="note">
          <span>{t('第一次用？三步就能把群消息变成待办：粘贴 → 检查 → 收录。')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={dismissFirstVisit}>
            {t('知道了')}
          </button>
        </div>
      )}
      <section className="hero">
        <h2>
          {t('把群里的消息')}<em>{t('粘进来')}</em>{t('，剩下的它替你记着')}
        </h2>
        <p>
          {t('「本周五23:59前交实验报告」「下周三下午2点3楼会议室」「11月20日前提交报销单」——')}
          {t('项目群、部门群、班级群、家长群，说的是同一件事：')}<strong>{t('有个截止时间，别错过')}</strong>。
        </p>
      </section>

      {sharedFrom && (
        <div className="share-banner" role="status">
          <span>{t('来自分享：内容已填入下面的输入框，点「开始解析」就能变成待办。')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSharedFrom(null)}>
            {t('知道了')}
          </button>
        </div>
      )}

      <section className="composer card">
        <div className="composer-head">
          <label htmlFor="notice">{t('群消息原文')}</label>
          <span className="muted">{t('{n} 字', { n: raw.length })}</span>
        </div>
        <textarea
          ref={textareaRef}
          id="notice"
          className="composer-input"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder={t('例如：\n【项目群】张经理：\n1. 本周五18:00前把预算表发到财务邮箱。\n2. 下周一上午10点在 3楼会议室 开复盘会。\n\n或者学校通知：\n本周五23:59前在学习通提交实验报告三。')}
          rows={7}
          spellCheck={false}
        />
        {pasteError && (
          <p className="import-error" role="alert">
            {pasteError}
          </p>
        )}
        <div className="composer-actions">
          <button type="button" className="btn btn-primary" onClick={handleParse} disabled={parsing || !raw.trim()}>
            {parsing ? t('解析中…') : t('开始解析')}
          </button>
          <button type="button" className="btn" onClick={() => void pasteFromClipboard()} disabled={parsing}>
            {t('粘贴分享内容')}
          </button>
          <button type="button" className="btn" onClick={() => setRaw(SAMPLE_WORK)} disabled={parsing}>
            {t('工作群示例')}
          </button>
          <button type="button" className="btn" onClick={() => setRaw(SAMPLE_NOTICE)} disabled={parsing}>
            {t('学校通知示例')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setRaw('')} disabled={parsing || !raw}>
            {t('清空')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setManualOpen((open) => !open)} disabled={parsing}>
            {t('手动添加')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setHistoryOpen((open) => !open)} disabled={parsing}>
            {history.length > 0 ? t('历史 ({n})', { n: history.length }) : t('历史')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setIcsOpen((open) => !open)} disabled={parsing}>
            {t('导入 .ics')}
          </button>
        </div>

        <ImportPanel
          onText={(text) => {
            setRaw(text)
            requestAnimationFrame(() => textareaRef.current?.focus())
          }}
        />

        {parsing && (
          <div className="stage">
            <span className="spinner" aria-hidden />
            <span>{stage || t('正在解析…')}</span>
          </div>
        )}
      </section>

      {manualOpen && <ManualAddForm onClose={() => setManualOpen(false)} />}

      {icsOpen && <IcsImportPanel onClose={() => setIcsOpen(false)} />}

      {historyOpen && (
        <HistoryPanel
          onReuse={(text) => {
            setRaw(text)
            setHistoryOpen(false)
            setAccepted(0)
            void parse(text)
          }}
        />
      )}

      {engineNote && (
        <div className="engine-note">
          <span className="engine-note-label">{t('解析引擎')}</span>
          <span>{engineNote}</span>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((warning) => (
            <li key={warning}>{t(warning)}</li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && batchMode && (
        <BatchPreview
          tasks={candidates}
          onAccepted={(count) => {
            setAccepted((n) => n + count)
          }}
        />
      )}

      {candidates.length > 0 && !batchMode && (
        <section className="results">
          <div className="results-head">
            <h3>
              {t('识别到')} <em>{candidates.length}</em> {t('条待办')}
            </h3>
            <div className="results-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={acceptAll}>
                {t('全部收录')}
              </button>
            </div>
          </div>

          {choiceGroups.size > 0 && (
            <div className="choice-picker" role="group" aria-label={t('二选一')}>
              <span className="muted">{t('「本周日」当天有两种理解，选一个：')}</span>
              {[...choiceGroups.entries()].map(([group, groupTasks]) => (
                <span key={group} className="choice-options">
                  {groupTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className={`btn btn-sm ${choiceSelection[group] === task.id ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setChoiceSelection((current) => ({ ...current, [group]: task.id }))}
                    >
                      {task.choiceLabel ? t(task.choiceLabel) : t('候选')}
                    </button>
                  ))}
                </span>
              ))}
            </div>
          )}

          <div className="cards">
            {visibleCandidates.map((task) => (
              <CandidateCard
                key={task.id}
                task={task}
                now={now}
                onUpdate={(patch) => updateCandidate(task.id, patch)}
                onAccept={async () => {
                  await acceptCandidates([task.id])
                  setAccepted((n) => n + 1)
                }}
                onDismiss={() => dismissCandidate(task.id)}
              />
            ))}
          </div>
        </section>
      )}

      {accepted > 0 && (
        <div className="toast">
          {t('已收录 {n} 条，去「日程」看看有没有撞车', { n: accepted })}
        </div>
      )}

      {candidates.length === 0 && !parsing && (
        <section className="card">
          <EmptyState
            title={t('从一条群通知开始')}
            body={t('贴一段群消息，拾穗会替你拆成待办。')}
            action={{ label: t('输入群消息'), onClick: () => textareaRef.current?.focus() }}
          />
        </section>
      )}

      {candidates.length === 0 && !parsing && (
        <section className="capabilities card">
          <h3>{t('它能认出什么')}</h3>
          <p className="muted" style={{ marginBottom: 14 }}>
            {t('不区分场景：公司群、项目群、班级群、家长群、学校教务，同一套规则。')}
          </p>
          <div className="cap-grid">
            <div>
              <h4>{t('时间')}</h4>
              <p>{t('本周五23:59 / 下周三 / 明晚8点 / 中午12点前 / 3天内 / 11月18日 / 周五下午2点')}</p>
            </div>
            <div>
              <h4>{t('事项')}</h4>
              <p>{t('任务与交付物、会议与培训、评审与验收、审批签字、报销缴费、报名、问卷打卡、考试')}</p>
            </div>
            <div>
              <h4>{t('提交渠道')}</h4>
              <p>{t('飞书、钉钉、企业微信、OA、Jira、在线文档、邮箱、学习通、腾讯会议、纸质线下')}</p>
            </div>
            <div>
              <h4>{t('不止于此')}</h4>
              <p>{t('收录后会自动体检：已经过期、两件撞车、同一天堆三件，都会直接标出来')}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
