import type { StoredTask } from 'shisui-core'
import { countdown, formatClock, formatDayLabel } from 'shisui-core'

interface Props {
  task: StoredTask
  now: number
  onToggle: () => void
  onDelete: () => void
}

export default function TaskRow({ task, now, onToggle, onDelete }: Props) {
  const at = task.dueAt ?? task.startAt
  const cd = at !== null ? countdown(at, new Date(now)) : null

  return (
    <li className={`task-row ${task.done ? 'is-done' : ''} ${cd && cd.tone === 'overdue' && !task.done ? 'is-overdue' : ''}`}>
      <button
        type="button"
        className={`check ${task.done ? 'is-checked' : ''}`}
        onClick={onToggle}
        aria-label={task.done ? '标记为未完成' : '标记为已完成'}
      >
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="task-body">
        <p className="task-title">{task.title}</p>
        <div className="task-meta">
          {at !== null && <span>{formatClock(at)}</span>}
          {task.channel && <span>· {task.channel}</span>}
          {task.location && <span>· {task.location}</span>}
          {task.editedFields.length > 0 && <span className="edited-tag">已手改 {task.editedFields.length} 处</span>}
        </div>
      </div>

      <div className="task-right">
        {cd && <span className={`countdown tone-${cd.tone}`}>{cd.text}</span>}
        <button type="button" className="icon-btn" onClick={onDelete} aria-label="删除">
          ✕
        </button>
      </div>
    </li>
  )
}

export function dayHeading(ms: number, now: number): string {
  const d = new Date(ms)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${formatDayLabel(ms, new Date(now))} · ${d.getMonth() + 1}月${d.getDate()}日 ${week}`
}
