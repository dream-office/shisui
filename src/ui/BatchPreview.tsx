import { useState } from 'react'
import type { ParsedTask } from 'shisui-core'
import { useApp } from '@/state/store'

function formatWhen(task: ParsedTask): string {
  const at = task.startAt ?? task.dueAt
  if (at === null) return '无时间'
  const date = new Date(at)
  const allDay = date.getHours() === 0 && date.getMinutes() === 0
  const stamp = `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`
  return allDay ? `${stamp} 全天` : `${stamp} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** 默认选中：普通任务全选；二选一组只选「本周」（没有本周就选第一个） */
function defaultSelection(tasks: ParsedTask[]): Set<string> {
  const selected = new Set<string>()
  const groupSeen = new Set<string>()
  for (const task of tasks) {
    if (!task.choiceGroup) {
      selected.add(task.id)
      continue
    }
    if (groupSeen.has(task.choiceGroup)) continue
    const inGroup = tasks.filter((item) => item.choiceGroup === task.choiceGroup)
    const preferred = inGroup.find((item) => item.choiceLabel === '本周') ?? inGroup[0]
    selected.add(preferred.id)
    groupSeen.add(task.choiceGroup)
  }
  return selected
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
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(tasks))
  const [busy, setBusy] = useState(false)

  const toggle = (task: ParsedTask) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(task.id)) {
        next.delete(task.id)
        return next
      }
      if (task.choiceGroup) {
        for (const item of tasks) {
          if (item.choiceGroup === task.choiceGroup) next.delete(item.id)
        }
      }
      next.add(task.id)
      return next
    })
  }

  const selectAll = () => setSelected(defaultSelection(tasks))
  const selectNone = () => setSelected(new Set())

  const accept = async () => {
    const ids = tasks.filter((task) => selected.has(task.id)).map((task) => task.id)
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
          批量预览<span className="muted">（{tasks.length} 条，已选 {selected.size}）</span>
        </h3>
        <div className="batch-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={selectAll}>
            全选
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={selectNone}>
            全不选
          </button>
        </div>
      </div>

      <ul className="batch-list">
        {tasks.map((task) => (
          <li key={task.id} className={`batch-item ${selected.has(task.id) ? 'is-selected' : ''}`}>
            <label className="batch-check">
              <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggle(task)} />
              <span className="batch-title">{task.title}</span>
            </label>
            <span className="batch-time muted">{formatWhen(task)}</span>
            {task.choiceLabel && <span className="batch-chip">{task.choiceLabel}</span>}
            {task.confidence === 'low' && <span className="batch-chip is-warn">待核对</span>}
          </li>
        ))}
      </ul>

      <div className="batch-footer">
        <button type="button" className="btn btn-primary" onClick={accept} disabled={busy || selected.size === 0}>
          收录选中（{selected.size}）
        </button>
        {tasks.some((task) => task.choiceGroup) && (
          <span className="muted">同一组只能选一个：「本周日」当天默认本周</span>
        )}
      </div>
    </section>
  )
}
