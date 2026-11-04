/**
 * 冲突体检：通知解析完只是「知道了」，真正省心的是「会不会撞车」。
 * 这是产品从「能解析」升级到「真正省心」的关键一步。
 */
import type { ParsedTask } from './types'
import { startOfDay } from './time'

export type ConflictLevel = 'danger' | 'warn'

export interface ConflictNote {
  id: string
  level: ConflictLevel
  title: string
  detail: string
  taskIds: string[]
}

interface Scannable extends Pick<ParsedTask, 'id' | 'title' | 'dueAt' | 'startAt' | 'kind'> {}

const CLASH_WINDOW_MS = 2 * 3600_000
const PILEUP_THRESHOLD = 3

/** 扫描冲突：已过期 / 同一时刻撞车 / 同一天堆积 */
export function scanConflicts(tasks: Scannable[], ref: Date = new Date()): ConflictNote[] {
  const notes: ConflictNote[] = []
  const active = tasks.filter((t) => t.dueAt !== null || t.startAt !== null)

  // 1) 已过期但还没处理
  for (const task of active) {
    const at = task.dueAt ?? task.startAt
    if (at !== null && at < ref.getTime()) {
      notes.push({
        id: `overdue_${task.id}`,
        level: 'danger',
        title: `「${task.title}」已经过期`,
        detail: '如果这事还没做完，尽快补交或联系老师说明情况。',
        taskIds: [task.id],
      })
    }
  }

  // 2) 两件事的时间撞得很近（2 小时内）
  const withDeadline = active
    .filter((t) => t.dueAt !== null && t.dueAt >= ref.getTime())
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
  for (let i = 1; i < withDeadline.length; i += 1) {
    const prev = withDeadline[i - 1]
    const cur = withDeadline[i]
    const gap = (cur.dueAt ?? 0) - (prev.dueAt ?? 0)
    if (gap <= CLASH_WINDOW_MS) {
      notes.push({
        id: `clash_${prev.id}_${cur.id}`,
        level: 'warn',
        title: '两件事几乎同时截止',
        detail: `「${prev.title}」和「${cur.title}」相距不到 2 小时，建议把其中一件提前做掉。`,
        taskIds: [prev.id, cur.id],
      })
    }
  }

  // 3) 同一天堆积 3 件以上
  const byDay = new Map<number, Scannable[]>()
  for (const task of withDeadline) {
    const day = startOfDay(new Date(task.dueAt as number)).getTime()
    const list = byDay.get(day) ?? []
    list.push(task)
    byDay.set(day, list)
  }
  for (const [, list] of byDay) {
    if (list.length >= PILEUP_THRESHOLD) {
      notes.push({
        id: `pileup_${list[0].id}`,
        level: 'warn',
        title: `这一天堆了 ${list.length} 件事`,
        detail: `当天有：${list.map((t) => `「${t.title}」`).join('、')}，建议提前分批完成。`,
        taskIds: list.map((t) => t.id),
      })
    }
  }

  return notes
}

/** 计算「最近 7 天的压力分布」，供仪表条渲染 */
export function weeklyLoad(tasks: Scannable[], ref: Date = new Date()): number[] {
  const base = startOfDay(ref).getTime()
  const buckets = new Array(7).fill(0) as number[]
  for (const task of tasks) {
    const at = task.dueAt ?? task.startAt
    if (at === null) continue
    const diff = Math.floor((startOfDay(new Date(at)).getTime() - base) / 86_400_000)
    if (diff >= 0 && diff < 7) buckets[diff] += 1
  }
  return buckets
}
