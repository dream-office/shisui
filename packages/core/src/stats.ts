/**
 * 统计口径（纯函数，注入 ref 便于确定性测试）：
 * - 本周完成率：分母 = **dueAt 落在本周**的任务数（不看完成时间）；分子 = 其中 done=true
 * - 解析手改率：分母 = engine ∈ {rule, llm, hybrid} 的任务数；分子 = 其中 editedFields 非空
 * - 分母为 0 → 返回 null（UI 显示「—」），不返回 0 或 NaN
 */
import type { StoredTask } from './types.js'

export interface Stats {
  weekStart: number
  weekEnd: number
  weekTotal: number
  doneThisWeek: number
  /** 0-100 的整数；分母为 0 时为 null */
  completion: number | null
  parsedTotal: number
  edited: number
  /** 0-100 的整数；分母为 0 时为 null */
  editRate: number | null
  total: number
  open: number
}

/** 本周一 00:00（以周一为一周起点） */
export function startOfWeek(ms: number): number {
  const d = new Date(ms)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function percent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return Math.round((numerator / denominator) * 100)
}

export function computeStats(tasks: readonly StoredTask[], ref: number): Stats {
  const weekStart = startOfWeek(ref)
  // 用日历日推进而不是 +7*86400000：夏令时切换周加 7 天会落到 01:00（少/多一小时）
  const endDate = new Date(weekStart)
  endDate.setDate(endDate.getDate() + 7)
  const weekEnd = endDate.getTime()

  const weekTasks = tasks.filter(
    (task) => task.dueAt !== null && task.dueAt >= weekStart && task.dueAt < weekEnd,
  )
  const doneThisWeek = weekTasks.filter((task) => task.done).length

  const parsedTasks = tasks.filter(
    (task) => task.engine === 'rule' || task.engine === 'llm' || task.engine === 'hybrid',
  )
  const edited = parsedTasks.filter((task) => task.editedFields.length > 0).length

  return {
    weekStart,
    weekEnd,
    weekTotal: weekTasks.length,
    doneThisWeek,
    completion: percent(doneThisWeek, weekTasks.length),
    parsedTotal: parsedTasks.length,
    edited,
    editRate: percent(edited, parsedTasks.length),
    total: tasks.length,
    open: tasks.filter((task) => !task.done).length,
  }
}
