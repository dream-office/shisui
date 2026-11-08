/**
 * v0.8.0 数据迁移与时间形状辅助（纯函数）。
 *
 * 老数据（v2）没有 endAt/allDay/seriesId/recurrenceIndex/skipped：
 * 迁移只补默认值、不改写已有值（尤其不把老全天的 dueAt 搬到 startAt），
 * 由 allDayAnchor() 统一读出「全天锚点」，避免全库改写。
 */

export interface TaskLike {
  dueAt?: number | null
  startAt?: number | null
  endAt?: number | null
  allDay?: boolean
  seriesId?: string | null
  recurrenceIndex?: number
  skipped?: boolean
}

/** 本地时间恰好 00:00:00 */
export function isLocalMidnight(ms: number): boolean {
  const d = new Date(ms)
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
}

/** v2 → v3：补新字段默认值；重复执行幂等 */
export type MigratedTask<T> = T & {
  endAt: number | null
  allDay: boolean
  seriesId: string | null
  recurrenceIndex: number
  skipped: boolean
}

export function migrateTaskV2toV3<T extends TaskLike>(task: T): MigratedTask<T> {
  const primary = task.startAt ?? task.dueAt ?? null
  const allDay = task.allDay ?? (primary !== null && isLocalMidnight(primary))
  return {
    ...task,
    endAt: task.endAt ?? null,
    allDay,
    seriesId: task.seriesId ?? null,
    recurrenceIndex: task.recurrenceIndex ?? 0,
    skipped: task.skipped ?? false,
  }
}

/** 主时刻（排序/统计/归属用）：startAt 优先，其次 dueAt */
export function primaryTime(task: TaskLike): number | null {
  return task.startAt ?? task.dueAt ?? null
}

/** 全天事件的日期锚点（兼容老数据 dueAt=00:00 与新数据 startAt=00:00） */
export function allDayAnchor(task: TaskLike): number | null {
  if (task.allDay !== true) return null
  return primaryTime(task)
}

/** 区间终点（exclusive）：endAt 优先；全天单日隐含 +1 天；定时点事件默认 30 分钟 */
export function taskEndMs(task: TaskLike, defaultDurationMs = 30 * 60 * 1000): number | null {
  const start = primaryTime(task)
  if (start === null) return null
  if (task.endAt !== null && task.endAt !== undefined && task.endAt > start) return task.endAt
  if (task.allDay === true) {
    const d = new Date(start)
    d.setDate(d.getDate() + 1)
    return d.getTime()
  }
  return start + defaultDurationMs
}

/**
 * 区间覆盖的本地日期数（端点按半开区间 [start, end)）。
 * 例：20 日 00:00 → 23 日 00:00 = 3 天；22:00 → 次日 01:00 = 2 天。
 */
export function spanDays(task: TaskLike): number {
  const start = primaryTime(task)
  const end = taskEndMs(task)
  if (start === null || end === null) return 1
  const startDay = new Date(start)
  startDay.setHours(0, 0, 0, 0)
  const endDay = new Date(end)
  endDay.setHours(0, 0, 0, 0)
  const diff = Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000)
  return Math.max(1, diff + (endDay.getTime() === end ? 0 : 1))
}

export function isSpanning(task: TaskLike): boolean {
  const start = primaryTime(task)
  if (start === null) return false
  const end = taskEndMs(task)
  return end !== null && new Date(start).toDateString() !== new Date(end).toDateString()
}
