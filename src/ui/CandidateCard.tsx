import type { ParsedTask, TaskKind } from 'shisui-core'
import { countdown, formatWhen, fromLocalInput, toLocalInput } from 'shisui-core'

const KIND_LABEL: Record<TaskKind, string> = {
  task: '任务',
  meeting: '会议',
  review: '评审',
  signup: '报名',
  payment: '报销/缴费',
  approval: '审批',
  survey: '问卷',
  exam: '考试',
  other: '其他',
}

const CONF_LABEL = {
  high: '高置信',
  medium: '待核对',
  low: '需确认',
} as const

interface Props {
  task: ParsedTask
  now: number
  onUpdate: (patch: Partial<ParsedTask>) => void
  onAccept: () => void
  onDismiss: () => void
}

export default function CandidateCard({ task, now, onUpdate, onAccept, onDismiss }: Props) {
  const timeValue = task.dueAt ?? task.startAt
  const cd = timeValue !== null ? countdown(timeValue, new Date(now)) : null

  return (
    <article className={`candidate card conf-${task.confidence}`}>
      <header className="candidate-head">
        <select
          className="chip chip-select"
          value={task.kind}
          onChange={(event) => onUpdate({ kind: event.target.value as TaskKind })}
          aria-label="事项类型"
        >
          {(Object.keys(KIND_LABEL) as TaskKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABEL[kind]}
            </option>
          ))}
        </select>

        <span className={`conf-badge conf-${task.confidence}`}>{CONF_LABEL[task.confidence]}</span>
        <span className={`engine-tag engine-${task.engine}`}>
          {task.engine === 'rule'
            ? '规则'
            : task.engine === 'llm'
              ? 'AI'
              : task.engine === 'manual'
                ? '手动'
                : task.engine === 'import'
                  ? '导入'
                  : '双引擎'}
        </span>
        {cd && <span className={`countdown tone-${cd.tone}`}>{cd.text}</span>}
      </header>

      <input
        className="candidate-title"
        value={task.title}
        onChange={(event) => onUpdate({ title: event.target.value })}
        aria-label="待办标题"
      />

      <div className="candidate-row">
        <label className="field">
          <span>时间</span>
          <input
            type="datetime-local"
            value={toLocalInput(timeValue)}
            onChange={(event) => {
              const next = fromLocalInput(event.target.value)
              onUpdate({ dueAt: next, startAt: task.kind === 'meeting' ? next : null })
            }}
          />
        </label>
        {timeValue !== null && <span className="muted">{formatWhen(timeValue, new Date(now))}</span>}
      </div>

      <div className="chips">
        {task.channel && <span className="chip">渠道 · {task.channel}</span>}
        {task.location && <span className="chip">地点 · {task.location}</span>}
        {task.dueAt === null && task.startAt !== null && <span className="chip chip-warn">缺截止时间</span>}
      </div>

      <details className="reasons">
        <summary>为什么这么判断（{task.reasons.length}）</summary>
        <ul>
          {task.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p className="raw">原文：{task.rawText}</p>
      </details>

      <div className="candidate-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onAccept}>
          收录进日程
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          不要这条
        </button>
      </div>
    </article>
  )
}
