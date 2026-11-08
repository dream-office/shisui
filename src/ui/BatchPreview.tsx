import { t } from '@/i18n'
import { useState } from 'react'
import { defaultChoiceSelection, toggleChoiceSelection, type ParsedTask } from 'shisui-core'
import { useApp } from '@/state/store'

function formatWhen(task: ParsedTask): string {
  const at = task.startAt ?? task.dueAt
  if (at === null) return t('无时间')
  const date = new Date(at)
  const allDay = date.getHours() === 0 && date.getMinutes() === 0
  const stamp = `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`
  return allDay ? `${stamp} 全天` : `${stamp} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * 多段粘贴的批量预览：勾选 / 全选 / 全不选 / 批量收录。
 * 同一二选一组（「本周日」当天）只能勾一个，勾新的会自动取消旧的。
 */
export default function BatchPreview({
  tasks,
  onAccepted,
}: {
  tasks: ParsedTask[]
  onAccepted: (count: number) => void
}) {
  const acceptCandidates = useApp((s) => s.acceptCandidates)
  const [selected, setSelected] = useState<string[]>(() => defaultChoiceSelection(tasks))
  const [busy, setBusy] = useState(false)

  const toggle = (task: ParsedTask) => {
    setSelected((current) => toggleChoiceSelection(current, task, tasks))
  }

  const selectAll = () => setSelected(defaultChoiceSelection(tasks))
  const selectNone = () => setSelected([])

  const accept = async () => {
    const ids = tasks.filter((task) => selected.includes(task.id)).map((task) => task.id)
    if (ids.length === 0) return
    setBusy(true)
    try {
      await acceptCandidates(ids)
      onAccepted(ids.length)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="batch-preview card">
      <div className="batch-head">
        <h3>
          {t('批量预览')}<span className="muted">（{tasks.length} 条，已选 {selected.length}）</span>
        </h3>
        <div className="batch-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={selectAll}>
            {t('全选')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={selectNone}>
            {t('全不选')}
          </button>
        </div>
      </div>

      <ul className="batch-list">
        {tasks.map((task) => (
          <li key={task.id} className={`batch-item ${selected.includes(task.id) ? 'is-selected' : ''}`}>
            <label className="batch-check">
              <input type="checkbox" checked={selected.includes(task.id)} onChange={() => toggle(task)} />
              <span className="batch-title">{task.title}</span>
            </label>
            <span className="batch-time muted">{formatWhen(task)}</span>
            {task.choiceLabel && <span className="batch-chip">{task.choiceLabel}</span>}
            {task.confidence === 'low' && <span className="batch-chip is-warn">{t('待核对')}</span>}
          </li>
        ))}
      </ul>

      <div className="batch-footer">
        <button type="button" className="btn btn-primary" onClick={accept} disabled={busy || selected.length === 0}>
          {t('收录选中（{n}）', { n: selected.length })}
        </button>
        {tasks.some((task) => task.choiceGroup) && (
          <span className="muted">{t('同一组只能选一个：「本周日」当天默认本周')}</span>
        )}
      </div>
    </section>
  )
}
