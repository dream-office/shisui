import { useMemo } from 'react'
import type { StoredTask } from 'shisui-core'
import { useApp } from '@/state/store'
import { useNow } from './useNow'

const DAY_MS = 86_400_000

/** 本周一 00:00（周一为一周起点） */
function startOfWeek(ms: number): number {
  const d = new Date(ms)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return Math.round((numerator / denominator) * 100)
}

function MetricBar({ label, hint, value }: { label: string; hint: string; value: number | null }) {
  return (
    <div className="metric card">
      <div className="metric-head">
        <span className="metric-label">{label}</span>
        <strong className="metric-value">{value === null ? '—' : `${value}%`}</strong>
      </div>
      <div className="metric-track">
        <div className="metric-fill" style={{ width: value === null ? '0%' : `${value}%` }} />
      </div>
      <p className="metric-hint muted">{hint}</p>
    </div>
  )
}

/**
 * 统计页：全部在本地用现有数据算，不引图表库。
 * 完成率分母按「dueAt 落在本周」的任务（不看完成时间）；手改率只统计解析来源的任务。
 */
export default function StatsView() {
  const tasks = useApp((s) => s.tasks)
  const now = useNow(60_000)

  const stats = useMemo(() => {
    const weekStart = startOfWeek(now)
    const weekEnd = weekStart + 7 * DAY_MS
    const weekTasks = tasks.filter(
      (task: StoredTask) => task.dueAt !== null && task.dueAt >= weekStart && task.dueAt < weekEnd,
    )
    const doneThisWeek = weekTasks.filter((task) => task.done).length

    const parsedTasks = tasks.filter(
      (task) => task.engine === 'rule' || task.engine === 'llm' || task.engine === 'hybrid',
    )
    const edited = parsedTasks.filter((task) => task.editedFields.length > 0).length

    return {
      weekTotal: weekTasks.length,
      doneThisWeek,
      completion: ratio(doneThisWeek, weekTasks.length),
      parsedTotal: parsedTasks.length,
      edited,
      editRate: ratio(edited, parsedTasks.length),
      total: tasks.length,
      open: tasks.filter((task) => !task.done).length,
    }
  }, [tasks, now])

  return (
    <section className="stats-view">
      <div className="stats-head">
        <h2>统计</h2>
        <span className="muted">全部在本地计算</span>
      </div>

      <div className="metric-grid">
        <MetricBar
          label="本周完成率"
          value={stats.completion}
          hint={`本周到期 ${stats.weekTotal} 件，已完成 ${stats.doneThisWeek} 件（按到期时间统计，不看完成时间）`}
        />
        <MetricBar
          label="解析手改率"
          value={stats.editRate}
          hint={`解析来源 ${stats.parsedTotal} 件，其中你手动改过 ${stats.edited} 件（手动添加 / 日历导入不算）`}
        />
      </div>

      <div className="metric-grid">
        <div className="metric card">
          <div className="metric-head">
            <span className="metric-label">全部任务</span>
            <strong className="metric-value">{stats.total}</strong>
          </div>
          <p className="metric-hint muted">包括所有来源与已完成</p>
        </div>
        <div className="metric card">
          <div className="metric-head">
            <span className="metric-label">未完成</span>
            <strong className="metric-value">{stats.open}</strong>
          </div>
          <p className="metric-hint muted">还在日程里的条目</p>
        </div>
      </div>
    </section>
  )
}
