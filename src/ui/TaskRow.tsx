import { useState } from 'react'
import { countdown, formatClock, formatDayLabel, spanDays, toggleTag } from 'shisui-core'
import type { StoredTask } from 'shisui-core'

interface Props {
  task: StoredTask
  now: number
  onToggle: () => void
  onDelete: () => void
  /** 重复规则描述（如「每周周五」），非重复任务为 null */
  seriesLabel?: string | null
  onSkip?: () => void
  onEndSeries?: () => void
  /** 多选模式 */
  selectionMode?: boolean
  selected?: boolean
  onSelect?: () => void
  /** 标签编辑（选中/未选中都可用） */
  onTagsChange?: (tags: string[]) => void
}

export default function TaskRow({
  task,
  now,
  onToggle,
  onDelete,
  seriesLabel,
  onSkip,
  onEndSeries,
  selectionMode,
  selected,
  onSelect,
  onTagsChange,
}: Props) {
  const [editingTags, setEditingTags] = useState(false)
  const [draftTag, setDraftTag] = useState('')
  const at = task.startAt ?? task.dueAt
  const cd = at !== null && task.done === false ? countdown(at, new Date(now)) : null
  const days = spanDays(task)
  const endMs = task.endAt ?? null
  // 全天事件的 endAt 是 exclusive：显示时回退一天，说「20–22 日」而不是「20–23 日」
  const displayEndMs = endMs !== null ? (task.allDay === true ? endMs - 24 * 3600_000 : endMs) : null
  const rangeText =
    days > 1 && at !== null && displayEndMs !== null
      ? `${new Date(at).getMonth() + 1}月${new Date(at).getDate()}日–${new Date(displayEndMs).getMonth() + 1}月${new Date(displayEndMs).getDate()}日（${days} 天）`
      : null

  const tags = task.tags ?? []

  const addTag = () => {
    if (!onTagsChange || !draftTag.trim()) return
    onTagsChange(toggleTag(tags, draftTag, true))
    setDraftTag('')
  }

  return (
    <li
      className={`task-row ${task.done ? 'is-done' : ''} ${cd && cd.tone === 'overdue' && !task.done ? 'is-overdue' : ''} ${selected ? 'is-selected' : ''}`}
    >
      {selectionMode && (
        <input
          type="checkbox"
          className="row-select"
          checked={selected === true}
          onChange={onSelect}
          aria-label={`选择「${task.title}」`}
        />
      )}

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
          {rangeText && <span className="range-tag">· {rangeText}</span>}
          {seriesLabel && <span className="series-tag">↻ {seriesLabel}</span>}
          {task.skipped && <span className="skipped-tag">已跳过</span>}
          {task.channel && <span>· {task.channel}</span>}
          {task.location && <span>· {task.location}</span>}
          {task.editedFields.length > 0 && <span className="edited-tag">已手改 {task.editedFields.length} 处</span>}
        </div>

        {(tags.length > 0 || editingTags || onTagsChange) && (
          <div className="task-tags">
            {tags.map((tag) => (
              <span className="tag" key={tag}>
                #{tag}
                {onTagsChange && (
                  <button
                    type="button"
                    className="tag-remove"
                    aria-label={`移除标签 ${tag}`}
                    onClick={() => onTagsChange(toggleTag(tags, tag, false))}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {onTagsChange && !editingTags && (
              <button type="button" className="tag-add" onClick={() => setEditingTags(true)}>
                ＋标签
              </button>
            )}
            {editingTags && (
              <span className="tag-editor">
                <input
                  value={draftTag}
                  onChange={(event) => setDraftTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addTag()
                    }
                    if (event.key === 'Escape') setEditingTags(false)
                  }}
                  placeholder="输入标签后回车"
                  aria-label="新标签"
                  autoFocus
                />
                <button type="button" className="tag-add" onClick={addTag}>
                  加
                </button>
                <button type="button" className="tag-add" onClick={() => setEditingTags(false)}>
                  完成
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="task-right">
        {cd && <span className={`countdown tone-${cd.tone}`}>{cd.text}</span>}
        {!task.done && onSkip && (
          <button type="button" className="icon-btn" onClick={onSkip} aria-label="跳过这一次" title="跳过这一次">
            ⏭
          </button>
        )}
        {task.seriesId && onEndSeries && (
          <button type="button" className="icon-btn" onClick={onEndSeries} aria-label="结束重复" title="结束重复">
            ⏹
          </button>
        )}
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
