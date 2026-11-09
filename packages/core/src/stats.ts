/**
 * 统计口径（纯函数，注入 ref 便于确定性测试）：
 * - 本周完成率：分母 = **dueAt 落在本周**的任务数（不看完成时间）；分子 = 其中 done=true
 * - 解析手改率：分母 = engine ∈ {rule, llm, hybrid} 的任务数；分子 = 其中 editedFields 非空
 * - 分母为 0 → 返回 null（UI 显示「—」），不返回 0 或 NaN
 */
import type { StoredTask } from './types.js'
import { scanConflicts } from './conflict.js'

const DAY_MS = 86_400_000

export interface OverdueBucket {
  key: 'under1d' | '1to3d' | '3to7d' | 'over7d'
  count: number
}

export interface ConflictCounts {
  overlap: number
  overdue: number
  clash: number
  pileup: number
  total: number
}

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
  /** 未完成且已超过主时刻的条目数 */
  overdue: number
  /** 按逾期时长分桶（只算未完成、未跳过） */
  overdueBuckets: OverdueBucket[]
  /** 当前未完成任务的冲突体检计数 */
  conflicts: ConflictCounts
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

function overdueBucket(age: number): OverdueBucket['key'] {
  if (age < DAY_MS) return 'under1d'
  if (age < 3 * DAY_MS) return '1to3d'
  if (age < 7 * DAY_MS) return '3to7d'
  return 'over7d'
}

export function computeStats(tasks: readonly StoredTask[], ref: number): Stats {
  const weekStart = startOfWeek(ref)
  // 用日历日推进而不是 +7*86400000：夏令时切换周加 7 天会落到 01:00（少/多一小时）
  const endDate = new Date(weekStart)
  endDate.setDate(endDate.getDate() + 7)
  const weekEnd = endDate.getTime()

  // 归属按主时刻 startAt ?? dueAt（拍板 7：多日区间按 start 归属）
  const weekTasks = tasks.filter((task) => {
    const at = task.startAt ?? task.dueAt
    return at !== null && at >= weekStart && at < weekEnd
  })
  const doneThisWeek = weekTasks.filter((task) => task.done).length

  const parsedTasks = tasks.filter(
    (task) => task.engine === 'rule' || task.engine === 'llm' || task.engine === 'hybrid',
  )
  const edited = parsedTasks.filter((task) => task.editedFields.length > 0).length

  // 逾期与冲突只看「还会被处理」的条目：完成、跳过都不再制造压力。
  const openTasks = tasks.filter((task) => !task.done && !task.skipped)
  const overdueTasks = openTasks.filter((task) => {
    const at = task.dueAt ?? task.startAt
    return at !== null && at < ref
  })
  const bucketCounts: Record<OverdueBucket['key'], number> = {
    under1d: 0,
    '1to3d': 0,
    '3to7d': 0,
    over7d: 0,
  }
  for (const task of overdueTasks) {
    const at = task.dueAt ?? task.startAt
    if (at === null) continue
    bucketCounts[overdueBucket(ref - at)] += 1
  }

  const conflicts: ConflictCounts = { overlap: 0, overdue: 0, clash: 0, pileup: 0, total: 0 }
  for (const note of scanConflicts(openTasks, new Date(ref))) {
    conflicts.total += 1
    if (note.id.startsWith('overlap_')) conflicts.overlap += 1
    else if (note.id.startsWith('overdue_')) conflicts.overdue += 1
    else if (note.id.startsWith('clash_')) conflicts.clash += 1
    else if (note.id.startsWith('pileup_')) conflicts.pileup += 1
  }

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
    overdue: overdueTasks.length,
    overdueBuckets: [
      { key: 'under1d', count: bucketCounts.under1d },
      { key: '1to3d', count: bucketCounts['1to3d'] },
      { key: '3to7d', count: bucketCounts['3to7d'] },
      { key: 'over7d', count: bucketCounts.over7d },
    ],
    conflicts,
  }
}
