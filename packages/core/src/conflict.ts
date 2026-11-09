/**
 * 冲突体检：通知解析完只是「知道了」，真正省心的是「会不会撞车」。
 * 这是产品从「能解析」升级到「真正省心」的关键一步。
 */
import type { ParsedTask } from './types.js'
import { message, type LocalizedMessage } from './messages.js'
import { startOfDay } from './time.js'

export type ConflictLevel = 'danger' | 'warn'

export interface ConflictNote {
  id: string
  level: ConflictLevel
  title: string
  detail: string
  titleCode?: LocalizedMessage
  detailCode?: LocalizedMessage
  taskIds: string[]
}

interface Scannable extends Pick<ParsedTask, 'id' | 'title' | 'dueAt' | 'startAt' | 'kind'> {
  endAt?: number | null
  allDay?: boolean
}

/** 事件区间 [start, end)：endAt 优先；全天隐含 +1 天；定时默认 30 分钟 */
function intervalOf(task: Scannable): [number, number] | null {
  const start = task.startAt ?? task.dueAt
  if (start === null || start === undefined) return null
  if (task.endAt !== null && task.endAt !== undefined && task.endAt > start) return [start, task.endAt]
  if (task.allDay === true) {
    const d = new Date(start)
    d.setDate(d.getDate() + 1)
    return [start, d.getTime()]
  }
  return [start, start + 30 * 60 * 1000]
}

const CLASH_WINDOW_MS = 2 * 3600_000
const PILEUP_THRESHOLD = 3

/** 扫描冲突：已过期 / 同一时刻撞车 / 同一天堆积 */
export function scanConflicts(tasks: Scannable[], ref: Date = new Date()): ConflictNote[] {
  const notes: ConflictNote[] = []

  // 区间重叠：半开区间相交才算冲突（[9,10) 与 [10,11) 不算）
  const intervals = tasks
    .map((task) => ({ task, span: intervalOf(task) }))
    .filter((item): item is { task: Scannable; span: [number, number] } => item.span !== null)
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      const a = intervals[i]
      const b = intervals[j]
      if (a.span[0] < b.span[1] && b.span[0] < a.span[1]) {
        notes.push({
          id: `overlap_${a.task.id}_${b.task.id}`,
          level: 'danger',
          title: '时间重叠',
          detail: `「${a.task.title}」与「${b.task.title}」的时间区间有重叠。`,
          titleCode: message('conflict.overlap.title'),
          detailCode: message('conflict.overlap.detail', { a: a.task.title, b: b.task.title }),
          taskIds: [a.task.id, b.task.id],
        })
      }
    }
  }

  const active = tasks.filter((t) => t.dueAt !== null || t.startAt !== null)

  // 1) 已过期但还没处理
  for (const task of active) {
    const at = task.dueAt ?? task.startAt
    if (at !== null && at < ref.getTime()) {
      notes.push({
        id: `overdue_${task.id}`,
        level: 'danger',
        title: `「${task.title}」已经过期`,
        detail: '如果还没完成，尽快补交，或联系通知发起人说明情况。',
        titleCode: message('conflict.overdue.title', { title: task.title }),
        detailCode: message('conflict.overdue.detail'),
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
        titleCode: message('conflict.clash.title'),
        detailCode: message('conflict.clash.detail', { a: prev.title, b: cur.title }),
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
        titleCode: message('conflict.pileup.title', { count: list.length }),
        detailCode: message('conflict.pileup.detail', { names: list.map((t) => t.title).join('、') }),
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
