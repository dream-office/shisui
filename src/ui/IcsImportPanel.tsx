import { t, tCore, formatDateOnlyI18n } from '@/i18n'
import { useState, type ChangeEvent } from 'react'
import { importIcs, mergeIcsImport } from 'shisui-core'
import type { LocalizedMessage, ParsedTask } from 'shisui-core'
import { useApp } from '@/state/store'

function formatWhen(task: ParsedTask): string {
  const at = task.startAt ?? task.dueAt
  if (at === null) return t('无时间')
  const date = new Date(at)
  const isMidnight =
    date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0
  if (isMidnight) return `${formatDateOnlyI18n(at)} · ${t('全天')}`
  return date.toLocaleString('zh-CN', { hour12: false })
}

/**
 * ICS 导入：选文件 → 预览（新增 / 更新 / 跳过）→ 确认。
 * 解析在 core 里（纯函数），落库用 store 的一个事务，坏文件不写半截数据。
 */
export default function IcsImportPanel({ onClose }: { onClose: () => void }) {
  const tasks = useApp((s) => s.tasks)
  const importIcsTasks = useApp((s) => s.importIcsTasks)

  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedTask[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [warningCodes, setWarningCodes] = useState<LocalizedMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const plan =
    parsed !== null
      ? mergeIcsImport(
          tasks.map((task) => ({ id: task.id, sourceUid: task.sourceUid ?? null })),
          parsed,
        )
      : null
  const updating = new Set(plan?.toUpdate.map((task) => `${task.title}|${task.startAt ?? task.dueAt}`) ?? [])
  const skippedInFile = new Set(plan?.skipped.map((task) => `${task.title}|${task.startAt ?? task.dueAt}`) ?? [])

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setWarnings([])
    setParsed(null)
    setFileName(file.name)
    setBusy(true)
    try {
      const text = await file.text()
      const out = importIcs(text, {
        makeId: (index, uid) => `ics_${Date.now()}_${index}_${(uid ?? 'noid').replace(/[^a-zA-Z0-9-_@.]/g, '_')}`,
      })
      setWarnings(out.warnings)
      setWarningCodes(out.warningCodes ?? [])
      if (out.tasks.length === 0) {
        const firstCode = out.warningCodes?.[0]
      setError(tCore(firstCode, out.warnings[0]) || t('这个文件里没有可以导入的事件'))
        return
      }
      setParsed(out.tasks)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('读取文件失败'))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!parsed || parsed.length === 0) return
    setBusy(true)
    try {
      const counts = await importIcsTasks(parsed)
      setResult(counts)
      setParsed(null)
      setWarnings([])
      setWarningCodes([])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('写入失败，已回滚'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ics-import card">
      <div className="ics-head">
        <h3>{t('导入日历文件')}</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          {t('关闭')}
        </button>
      </div>
      <p className="muted" style={{ marginTop: -4 }}>
        {t('支持系统日历 / Google Calendar 导出的')} <code>.ics</code>{t('。同一事件重复导入会更新，不会翻倍。')}
        <br />
        {t('重复事件（RRULE）只导入首个实例。')}
      </p>

      <label className="ics-file">
        <input type="file" accept=".ics,text/calendar" onChange={onFile} disabled={busy} />
      </label>

      {busy && <p className="muted">{t('正在解析…')}</p>}

      {error && <p className="ics-error">{error}</p>}

      {warnings.length > 0 && (
        <ul className="ics-warnings">
          {warnings.slice(0, 6).map((warning, index) => (
            <li key={`${index}-${warning}`}>{tCore(warningCodes[index], warning)}</li>
          ))}
          {warnings.length > 6 && <li>{t('另有 {n} 条提示', { n: warnings.length - 6 })}</li>}
        </ul>
      )}

      {parsed && plan && (
        <div className="ics-preview">
          <p className="ics-summary">
            <strong>{fileName}</strong> {t('· 新增')} <b>{plan.toInsert.length}</b> {t('/ 更新')} <b>{plan.toUpdate.length}</b> / 跳过{' '}
            <b>{plan.skipped.length}</b>
          </p>
          {warnings.some((warning) => warning.includes('重复事件')) && (
            <p className="ics-note">{t('含重复事件（RRULE）：只导入首个实例，后续不自动展开。')}</p>
          )}
          <ul>
            {parsed.slice(0, 10).map((task) => {
              const key = `${task.title}|${task.startAt ?? task.dueAt}`
              const status = skippedInFile.has(key) ? '跳过' : updating.has(key) ? '更新' : '新增'
              return (
                <li key={task.id}>
                  <span className={`ics-chip ics-chip-${status === '新增' ? 'new' : status === '更新' ? 'update' : 'skip'}`}>
                    {status}
                  </span>
                  <span className="ics-title">{task.title}</span>
                  <span className="muted">{formatWhen(task)}</span>
                </li>
              )
            })}
            {parsed.length > 10 && <li className="muted">{t('…另有 {n} 条', { n: parsed.length - 10 })}</li>}
          </ul>
          <div className="ics-actions">
            <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
              {t('确认导入')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setParsed(null)} disabled={busy}>
              {t('取消')}
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className="ics-result" role="status">
          导入完成：新增 {result.added} 条 · 更新 {result.updated} 条 · 跳过 {result.skipped} 条
        </p>
      )}
    </section>
  )
}
