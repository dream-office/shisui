import { t } from '@/i18n'
import { useState } from 'react'
import { normalizeTags, spanDays, toggleTag } from 'shisui-core'
import { countdownI18n, formatClockI18n, formatMonthDayI18n, getLang } from '@/i18n'
import type { StoredTask } from 'shisui-core'
import type { TaskEditFields } from '@/state/store'

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
  /** 改这一次 */
  onEditOnce?: (fields: TaskEditFields) => void
  /** 改整个系列（仅 seriesId 存在时提供） */
  onEditSeries?: (fields: TaskEditFields) => void
  /** 改整个系列将同步的未完成实例数（当前 + 未来未完成） */
  seriesAffectedCount?: number
}

const KIND_OPTIONS: Array<{ value: StoredTask['kind']; label: string }> = [
  { value: 'task', label: '任务' },
  { value: 'meeting', label: '会议' },
  { value: 'review', label: '评审' },
  { value: 'signup', label: '报名' },
  { value: 'payment', label: '缴费' },
  { value: 'approval', label: '审批' },
  { value: 'survey', label: '问卷' },
  { value: 'exam', label: '考试' },
  { value: 'other', label: '其他' },
]

function toDatetimeLocal(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
  onEditOnce,
  onEditSeries,
  seriesAffectedCount,
}: Props) {
  const [editingTags, setEditingTags] = useState(false)
  const [draftTag, setDraftTag] = useState('')
  const [editing, setEditing] = useState(false)
  const [scope, setScope] = useState<'once' | 'series'>('once')
  const [draft, setDraft] = useState({
    title: task.title,
    time: toDatetimeLocal(task.startAt ?? task.dueAt),
    channel: task.channel ?? '',
    location: task.location ?? '',
    kind: task.kind,
    tags: (task.tags ?? []).join(', '),
  })
  const at = task.startAt ?? task.dueAt
  const cd = at !== null && task.done === false ? countdownI18n(at, new Date(now)) : null
  const days = spanDays(task)
  const endMs = task.endAt ?? null
  // 全天事件的 endAt 是 exclusive：显示时回退一天，说「20–22 日」而不是「20–23 日」
  const displayEndMs = endMs !== null ? (task.allDay === true ? endMs - 24 * 3600_000 : endMs) : null
  const rangeText =
    days > 1 && at !== null && displayEndMs !== null
      ? getLang() === 'en'
        ? `${formatMonthDayI18n(at)}–${formatMonthDayI18n(displayEndMs)} (${days} days)`
        : `${new Date(at).getMonth() + 1}月${new Date(at).getDate()}日–${new Date(displayEndMs).getMonth() + 1}月${new Date(displayEndMs).getDate()}日（${days} 天）`
      : null

  const tags = task.tags ?? []
  const canEditSeries = Boolean(task.seriesId && onEditSeries)

  const addTag = () => {
    if (!onTagsChange || !draftTag.trim()) return
    onTagsChange(toggleTag(tags, draftTag, true))
    setDraftTag('')
  }

  const saveEdit = () => {
    const fields: TaskEditFields = {
      title: draft.title,
      kind: draft.kind,
      channel: draft.channel,
      location: draft.location,
      tags: normalizeTags(draft.tags.split(/[,，\s]+/).filter(Boolean)),
    }
    if (draft.time) {
      const parsed = new Date(draft.time).getTime()
      if (Number.isFinite(parsed)) fields.primaryTime = parsed
    }
    if (canEditSeries && scope === 'series') {
      onEditSeries?.(fields)
    } else {
      onEditOnce?.(fields)
    }
    setEditing(false)
  }

  return (
    <li
      className={`task-row ${task.done ? 'is-done' : ''} ${task.skipped ? 'is-skipped' : ''} ${cd && cd.tone === 'overdue' && !task.done ? 'is-overdue' : ''} ${selected ? 'is-selected' : ''}`}
        aria-disabled={task.skipped || undefined}
    >
      {selectionMode && (
        <input
          type="checkbox"
          className="row-select"
          checked={selected === true}
          onChange={onSelect}
          aria-label={t('选择「{v}」', { v: task.title })}
        />
      )}

      <button
        type="button"
        className={`check ${task.done ? 'is-checked' : ''}`}
        onClick={onToggle}
        aria-label={task.done ? t('标记为未完成') : t('标记为已完成')}
      >
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="task-body">
        <p className="task-title">{task.title}</p>
        <div className="task-meta">
          {at !== null && <span>{formatClockI18n(at)}</span>}
          {rangeText && <span className="range-tag">· {rangeText}</span>}
          {seriesLabel && <span className="series-tag">↻ {seriesLabel}</span>}
          {task.skipped && <span className="skipped-tag">{t('已跳过')}</span>}
          {task.channel && <span>· {task.channel}</span>}
          {task.location && <span>· {task.location}</span>}
          {task.editedFields.length > 0 && <span className="edited-tag">{t('已手改 {n} 处', { n: task.editedFields.length })}</span>}
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
                    aria-label={t('移除标签 {v}', { v: tag })}
                    onClick={() => onTagsChange(toggleTag(tags, tag, false))}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {onTagsChange && !editingTags && (
              <button type="button" className="tag-add" onClick={() => setEditingTags(true)}>
                {t('＋标签')}
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
                  placeholder={t('输入标签后回车')}
                  aria-label={t('新标签')}
                  autoFocus
                />
                <button type="button" className="tag-add" onClick={addTag}>
                  {t('加')}
                </button>
                <button type="button" className="tag-add" onClick={() => setEditingTags(false)}>
                  {t('完成')}
                </button>
              </span>
            )}
          </div>
        )}

        {(task.url || task.note) && (
          <div className="task-extra">
            {task.url && /^https?:\/\//i.test(task.url) && (
              <a className="task-link" href={task.url} target="_blank" rel="noreferrer">
                {t('打开链接')}
              </a>
            )}
            {task.note && (
              <details className="task-note">
                <summary>{t('备注')}</summary>
                <p>{task.note}</p>
              </details>
            )}
          </div>
        )}

        {editing && (
          <div className="task-editor" role="group" aria-label={t('编辑任务')}>
            <label className="field block">
              <span>{t('标题')}</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                aria-label={t('编辑标题')}
              />
            </label>
            <label className="field block">
              <span>{canEditSeries && scope === 'series' ? '时刻（日期不变）' : '时间'}</span>
              {canEditSeries && scope === 'series' ? (
                <input
                  type="time"
                  value={draft.time.slice(11, 16)}
                  onChange={(event) => {
                    const clock = event.target.value
                    if (!clock) return
                    const datePart = draft.time.slice(0, 10) || toDatetimeLocal(Date.now()).slice(0, 10)
                    setDraft({ ...draft, time: `${datePart}T${clock}` })
                  }}
                  aria-label={t('编辑时间（只改时刻）')}
                />
              ) : (
                <input
                  type="datetime-local"
                  value={draft.time}
                  onChange={(event) => setDraft({ ...draft, time: event.target.value })}
                  aria-label={t('编辑时间')}
                />
              )}
            </label>
            <div className="edit-inline">
              <label className="field block">
                <span>{t('类型')}</span>
                <select
                  value={draft.kind}
                  onChange={(event) => setDraft({ ...draft, kind: event.target.value as StoredTask['kind'] })}
                  aria-label={t('编辑类型')}
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field block">
                <span>{t('渠道')}</span>
                <input value={draft.channel} onChange={(event) => setDraft({ ...draft, channel: event.target.value })} aria-label={t('编辑渠道')} />
              </label>
              <label className="field block">
                <span>{t('地点')}</span>
                <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} aria-label={t('编辑地点')} />
              </label>
            </div>
            <label className="field block">
              <span>{t('标签（逗号分隔）')}</span>
              <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} aria-label={t('编辑标签')} />
            </label>

            {canEditSeries && (
              <fieldset className="scope-choice">
                <legend>{t('改哪里')}</legend>
                <label>
                  <input type="radio" name={`scope-${task.id}`} checked={scope === 'once'} onChange={() => setScope('once')} />
                  {t('只改这一次')}
                </label>
                <label>
                  <input type="radio" name={`scope-${task.id}`} checked={scope === 'series'} onChange={() => setScope('series')} />
                  {t('改整个系列（当前 + 未来未完成）')}
                </label>
                {scope === 'series' && (
                  <p className="muted edit-hint">
                    改整个系列只改时刻，日期与重复规则保持不变；
                    将同步 {seriesAffectedCount ?? 1} 个未完成实例（已完成/已跳过历史不动）。
                  </p>
                )}
              </fieldset>
            )}

            <div className="edit-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit}>
                {t('保存')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                {t('取消')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="task-right">
        {cd && <span className={`countdown tone-${cd.tone}`}>{cd.text}</span>}
        {!task.done && onEditOnce && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setEditing((value) => {
                if (value) return false
                // 每次打开都从当前任务重新取草稿；范围默认「只改这一次」
                setDraft({
                  title: task.title,
                  time: toDatetimeLocal(task.startAt ?? task.dueAt),
                  channel: task.channel ?? '',
                  location: task.location ?? '',
                  kind: task.kind,
                  tags: (task.tags ?? []).join(', '),
                })
                setScope('once')
                return true
              })
            }}
            aria-label={t('编辑任务')}
            title={t('编辑任务')}
          >
            ✎
          </button>
        )}
        {!task.done && onSkip && (
          <button type="button" className="icon-btn" onClick={onSkip} aria-label={t('跳过这一次')} title={t('跳过这一次')}>
            ⏭
          </button>
        )}
        {task.seriesId && onEndSeries && (
          <button type="button" className="icon-btn" onClick={onEndSeries} aria-label={t('结束重复')} title={t('结束重复')}>
            ⏹
          </button>
        )}
        <button type="button" className="icon-btn" onClick={onDelete} aria-label={t('删除')}>
          ✕
        </button>
      </div>
    </li>
  )
}

export function dayHeading(ms: number, _now: number): string {
  const d = new Date(ms)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return getLang() === 'en'
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', weekday: 'long' }).format(d)
    : `${formatMonthDayI18n(ms)} ${week}`
}
