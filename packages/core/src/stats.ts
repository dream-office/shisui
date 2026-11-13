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

export interface WeekCompletion {
  weekStart: number
  weekEnd: number
  total: number
  done: number
  /** 0-100；本周没有任务时为 null */
  rate: number | null
}

export interface KindCount {
  kind: StoredTask['kind']
  count: number
}

export interface DelayStats {
  /** 已完成的条目数 */
  doneTotal: number
  /** 其中带 doneAt（实际完成时刻）的条目数 */
  doneWithTime: number
  /** doneAt 晚于截止/开始时刻的条目数 */
  lateDone: number
  /** 0-100；没有可判断条目时为 null */
  lateRate: number | null
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
  /** 显式跳过的条目数（不算完成率/逾期/冲突） */
  skipped: number
  /** 已完成条目总数 */
  doneTotal: number
  /** 其中带 doneAt 的条目数（可判断是否延期） */
  doneWithTime: number
  /** doneAt 晚于截止/开始时刻的条目数 */
  lateDone: number
  /** 0-100；没有可判断条目时为 null */
  lateRate: number | null
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
    if (task.skipped) return false
    const at = task.startAt ?? task.dueAt
    return at !== null && at >= weekStart && at < weekEnd
  })
  const doneThisWeek = weekTasks.filter((task) => task.done).length

  const parsedTasks = tasks.filter(
    (task) =>
      !task.skipped &&
      (task.engine === 'rule' || task.engine === 'llm' || task.engine === 'hybrid'),
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

  const deadlineOf = (task: StoredTask) => task.dueAt ?? task.startAt
  const doneTasks = tasks.filter((task) => task.done)
  const timedDone = doneTasks.filter((task) => typeof task.doneAt === 'number')
  const lateDone = timedDone.filter((task) => {
    const deadline = deadlineOf(task)
    return deadline !== null && (task.doneAt as number) > deadline
  }).length

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
    open: tasks.filter((task) => !task.done && !task.skipped).length,
    skipped: tasks.filter((task) => task.skipped).length,
    doneTotal: doneTasks.length,
    doneWithTime: timedDone.length,
    lateDone,
    lateRate: percent(lateDone, timedDone.length),
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


/** 8 周完成趋势（含本周；周一为起点，跳过 skipped 不计分母） */
export function completionTrend(
  tasks: readonly StoredTask[],
  ref: number,
  weeks = 8,
): WeekCompletion[] {
  const points: WeekCompletion[] = []
  const currentStart = startOfWeek(ref)
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const startDate = new Date(currentStart)
    startDate.setDate(startDate.getDate() - offset * 7)
    const weekStart = startDate.getTime()
    const endDate = new Date(weekStart)
    endDate.setDate(endDate.getDate() + 7)
    const weekEnd = endDate.getTime()
    const weekTasks = tasks.filter((task) => {
      if (task.skipped) return false
      const at = task.startAt ?? task.dueAt
      return at !== null && at >= weekStart && at < weekEnd
    })
    const done = weekTasks.filter((task) => task.done).length
    points.push({
      weekStart,
      weekEnd,
      total: weekTasks.length,
      done,
      rate: percent(done, weekTasks.length),
    })
  }
  return points
}

/** 按任务类型分布（全部任务，含已完成/跳过；用于统计页） */
export function kindDistribution(tasks: readonly StoredTask[]): KindCount[] {
  const counts = new Map<StoredTask['kind'], number>()
  for (const task of tasks) counts.set(task.kind, (counts.get(task.kind) ?? 0) + 1)
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
}
