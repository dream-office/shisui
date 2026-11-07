import { useState, type FormEvent } from 'react'
import type { TaskKind } from 'shisui-core'
import { useApp } from '@/state/store'

const KINDS: { value: TaskKind; label: string }[] = [
  { value: 'task', label: '任务 / 交付物' },
  { value: 'meeting', label: '会议 / 活动' },
  { value: 'review', label: '评审 / 验收' },
  { value: 'signup', label: '报名 / 登记' },
  { value: 'payment', label: '缴费 / 报销' },
  { value: 'approval', label: '审批 / 确认' },
  { value: 'survey', label: '问卷 / 填表' },
  { value: 'exam', label: '考试 / 测验' },
  { value: 'other', label: '其它' },
]

/** 默认填充一个今天稍晚的时间，减少手输成本 */
function defaultWhen(): string {
  const d = new Date()
  d.setHours(18, 0, 0, 0)
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 手动添加：不依赖解析，用于「口头通知」或「解析错了想自己补一条」。
 * 表单只负责收集，构造待办与校验在 core 的 createManualTask 里（纯函数、有单测）。
 */
export default function ManualAddForm({ onClose }: { onClose: () => void }) {
  const addManualTask = useApp((s) => s.addManualTask)
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState(defaultWhen)
  const [kind, setKind] = useState<TaskKind>('task')
  const [channel, setChannel] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('先写一个标题')
      return
    }
    const dueAt = new Date(when).getTime()
    if (Number.isNaN(dueAt)) {
      setError('时间格式不对，请重新选')
      return
    }
    setSaving(true)
    try {
      await addManualTask({ title, dueAt, kind, channel, location })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="manual card" onSubmit={submit}>
      <div className="manual-head">
        <h3>手动添加一条</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          取消
        </button>
      </div>
      <p className="muted" style={{ marginTop: -4 }}>
        口头通知、临时安排、或者解析结果想自己修 —— 都可以直接写在这里。不走解析引擎。
      </p>

      <label className="field">
        <span>标题</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：把报销单交给财务"
          maxLength={60}
          autoFocus
        />
      </label>

      <div className="manual-row">
        <label className="field">
          <span>截止时间</span>
          <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
        </label>
        <label className="field">
          <span>类型</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as TaskKind)}>
            {KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="manual-row">
        <label className="field">
          <span>渠道（可选）</span>
          <input value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="学习通 / 邮箱 / 线下…" />
        </label>
        <label className="field">
          <span>地点（可选）</span>
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="3 楼会议室" />
        </label>
      </div>

      {error && <p className="manual-error">{error}</p>}

      <div className="manual-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '保存中…' : '添加'}
        </button>
      </div>
    </form>
  )
}
