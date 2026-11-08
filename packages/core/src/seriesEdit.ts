/**
 * 系列编辑（改这一次 / 改整个系列）的纯逻辑：
 * - 改这一次：只改当前实例，series 不动
 * - 改整个系列：改 series 的展示字段（title/kind/channel/location/tags），
 *   并同步「当前 + 未来未完成实例」；已完成/已跳过历史不动
 * - 本版不支持改 RRULE（改规则 = 结束系列 + 新建），见已知限制
 */

export interface SeriesEditableFields {
  title?: string
  kind?: string
  channel?: string | null
  location?: string | null
  tags?: string[]
}

export interface EditableTaskLike {
  id: string
  seriesId?: string | null
  recurrenceIndex?: number
  done?: boolean
  skipped?: boolean
}

/**
 * 需要同步的实例：同系列、序号 >= 当前、且未完成/未跳过。
 * 当前实例即使 done=false/skipped=false 也会命中（index 相等）。
 */
export function instancesToSync<T extends EditableTaskLike>(
  tasks: readonly T[],
  seriesId: string,
  fromIndex: number,
): T[] {
  return tasks.filter(
    (task) =>
      task.seriesId === seriesId &&
      (task.recurrenceIndex ?? 0) >= fromIndex &&
      task.done !== true &&
      task.skipped !== true,
  )
}

/** 把可编辑字段收敛成 patch（未提供的字段不出现，避免误清空） */
export function editablePatch(fields: SeriesEditableFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (fields.title !== undefined) patch.title = fields.title.trim()
  if (fields.kind !== undefined) patch.kind = fields.kind
  if (fields.channel !== undefined) patch.channel = fields.channel?.trim() || null
  if (fields.location !== undefined) patch.location = fields.location?.trim() || null
  if (fields.tags !== undefined) patch.tags = fields.tags
  return patch
}


/** 取时间戳的时刻（时/分/秒/毫秒） */
export function clockOf(ms: number): { hours: number; minutes: number; seconds: number; milliseconds: number } {
  const d = new Date(ms)
  return { hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds(), milliseconds: d.getMilliseconds() }
}

/**
 * 只替换「时刻」，保留原日期（改整个系列用；本版不允许改日期，
 * 避免频率/anchor 与日期语义打架）。
 */
export function withClock(ms: number, clock: { hours: number; minutes: number; seconds: number; milliseconds: number }): number {
  const d = new Date(ms)
  d.setHours(clock.hours, clock.minutes, clock.seconds, clock.milliseconds)
  return d.getTime()
}
