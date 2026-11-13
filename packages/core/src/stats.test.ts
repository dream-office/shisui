import { describe, expect, it } from 'vitest'
import { completionTrend, computeStats, kindDistribution, startOfWeek } from './stats.js'
import type { StoredTask } from './types.js'

const REF = new Date(2026, 10, 11, 10, 0, 0).getTime() // 周三 2026-11-11

function task(partial: Partial<StoredTask> & { id: string }): StoredTask {
  return {
    title: partial.id,
    dueAt: null,
    startAt: null,
    kind: 'task',
    channel: null,
    location: null,
    rawText: partial.id,
    confidence: 'high',
    reasons: [],
    engine: 'rule',
    createdAt: 0,
    done: false,
    editedFields: [],
    ...partial,
  }
}

const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h, 0, 0).getTime()

describe('startOfWeek', () => {
  it('以周一为一周起点', () => {
    expect(startOfWeek(REF)).toBe(new Date(2026, 10, 9, 0, 0, 0, 0).getTime())
  })

  it('周日仍归属上一周（周一为起点）', () => {
    const sunday = new Date(2026, 10, 15, 20, 0, 0).getTime()
    expect(startOfWeek(sunday)).toBe(new Date(2026, 10, 9, 0, 0, 0, 0).getTime())
  })
})

describe('computeStats 完成率（按 dueAt 落在本周）', () => {
  it('只统计 dueAt 在本周的任务；已完成计入分子', () => {
    const tasks = [
      task({ id: 'a', dueAt: at(11, 9), done: true }), // 本周一
      task({ id: 'b', dueAt: at(11, 15), done: false }), // 本周日
      task({ id: 'c', dueAt: at(11, 8), done: true }), // 上周日 → 不算
      task({ id: 'd', dueAt: at(11, 16), done: true }), // 下周一 → 不算
      task({ id: 'e', dueAt: null }), // 无时间 → 不算
    ]
    const stats = computeStats(tasks, REF)
    expect(stats.weekTotal).toBe(2)
    expect(stats.doneThisWeek).toBe(1)
    expect(stats.completion).toBe(50)
  })

  it('不看完成时间：本周 later 完成的任务照样计入', () => {
    const tasks = [task({ id: 'a', dueAt: at(11, 10), done: true, createdAt: at(11, 20) })]
    expect(computeStats(tasks, REF).completion).toBe(100)
  })

  it('本周没有任务 → completion 为 null（UI 显示「—」）', () => {
    const stats = computeStats([task({ id: 'x', dueAt: at(10, 1) })], REF)
    expect(stats.weekTotal).toBe(0)
    expect(stats.completion).toBeNull()
  })

  it('四舍五入到整数百分比', () => {
    const tasks = [
      task({ id: 'a', dueAt: at(11, 9), done: true }),
      task({ id: 'b', dueAt: at(11, 10), done: false }),
      task({ id: 'c', dueAt: at(11, 11), done: false }),
    ]
    expect(computeStats(tasks, REF).completion).toBe(33) // 1/3 → 33
  })
})

describe('computeStats 手改率（分母只算解析来源）', () => {
  it('manual / import 不计入分母', () => {
    const tasks = [
      task({ id: 'r', engine: 'rule', editedFields: ['title'] }),
      task({ id: 'l', engine: 'llm' }),
      task({ id: 'h', engine: 'hybrid' }),
      task({ id: 'm', engine: 'manual', editedFields: ['title'] }),
      task({ id: 'i', engine: 'import', editedFields: ['title'] }),
    ]
    const stats = computeStats(tasks, REF)
    expect(stats.parsedTotal).toBe(3)
    expect(stats.edited).toBe(1)
    expect(stats.editRate).toBe(33)
    expect(stats.total).toBe(5)
  })

  it('没有解析来源任务 → editRate 为 null', () => {
    const stats = computeStats([task({ id: 'm', engine: 'manual' })], REF)
    expect(stats.parsedTotal).toBe(0)
    expect(stats.editRate).toBeNull()
  })
})


describe('computeStats 夏令时边界', () => {
  it('DST 切换周：weekEnd 是下周一 00:00（不是 01:00）', () => {
    // 2026-03-04 周三；美国夏令时 2026-03-08 开始
    const ref = new Date(2026, 2, 4, 10, 0, 0).getTime()
    const stats = computeStats([], ref)
    const end = new Date(stats.weekEnd)

    expect(end.getDay()).toBe(1) // 周一
    expect(end.getHours()).toBe(0)
    expect(end.getMinutes()).toBe(0)
    expect(stats.weekEnd).toBe(new Date(2026, 2, 9, 0, 0, 0, 0).getTime())
  })
})


describe('归属按 startAt（拍板 7）', () => {
  it('startAt 在本周、dueAt 不在 → 计入本周', () => {
    const tasks = [
      task({ id: 'a', startAt: at(11, 10), dueAt: at(12, 10), done: false }),
    ]
    const stats = computeStats(tasks, REF)
    expect(stats.weekTotal).toBe(1)
  })
})

describe('未完成逾期分布', () => {
  it('按 1 天内 / 1-3 天 / 3-7 天 / 7 天以上分桶，完成和跳过不算', () => {
    const tasks = [
      task({ id: 'a', dueAt: at(11, 11, 9) }), // 1 小时
      task({ id: 'b', dueAt: at(11, 9, 12) }), // 1 天 22 小时
      task({ id: 'c', dueAt: at(11, 6, 12) }), // 5 天
      task({ id: 'd', dueAt: at(10, 20, 12) }), // 22 天
      task({ id: 'done', dueAt: at(11, 1, 12), done: true }),
      task({ id: 'skipped', dueAt: at(11, 1, 12), skipped: true }),
      task({ id: 'no-time' }),
    ]
    const stats = computeStats(tasks, REF)
    expect(stats.overdue).toBe(4)
    expect(stats.overdueBuckets.map((bucket) => bucket.count)).toEqual([1, 1, 1, 1])
    // 每个条目只进一个桶；逾期分布和冲突体检的「已过期」应该同口径
    expect(stats.overdueBuckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(stats.overdue)
    expect(stats.conflicts.overdue).toBe(stats.overdue)
  })

  it('没有 dueAt 时按 startAt 判断逾期', () => {
    const taskWithStart = task({ id: 'meeting', startAt: REF - 2 * 3_600_000 })
    const stats = computeStats([taskWithStart], REF)
    expect(stats.overdue).toBe(1)
    expect(stats.overdueBuckets[0].count).toBe(1)
  })

  it('正好 1 天 / 3 天 / 7 天分别落在 1–3 天 / 3–7 天 / 7 天以上', () => {
    const DAY = 86_400_000
    const tasks = [
      task({ id: 'one-day', dueAt: REF - DAY }),
      task({ id: 'three-days', dueAt: REF - 3 * DAY }),
      task({ id: 'seven-days', dueAt: REF - 7 * DAY }),
    ]
    const stats = computeStats(tasks, REF)
    expect(stats.overdue).toBe(3)
    expect(stats.overdueBuckets.map((bucket) => bucket.count)).toEqual([0, 1, 1, 1])
  })
})

describe('冲突体检计数', () => {
  it('时间重叠与截止撞车分别计数，完成的任务不参与', () => {
    const ref = new Date(2026, 10, 11, 10, 0, 0).getTime()
    const tasks = [
      task({ id: 'a', dueAt: new Date(2026, 10, 11, 12, 0, 0).getTime() }),
      task({ id: 'b', dueAt: new Date(2026, 10, 11, 12, 15, 0).getTime() }),
      task({
        id: 'done',
        dueAt: new Date(2026, 10, 11, 12, 30, 0).getTime(),
        done: true,
      }),
    ]
    const stats = computeStats(tasks, ref)
    expect(stats.conflicts.overlap).toBe(1)
    expect(stats.conflicts.clash).toBe(1)
    expect(stats.conflicts.overdue).toBe(0)
    expect(stats.conflicts.total).toBe(2)
  })

  it('完成与跳过的条目不参与任何冲突计数', () => {
    const ref = new Date(2026, 10, 11, 10, 0, 0).getTime()
    const due = (h: number, m = 0) => new Date(2026, 10, 11, h, m, 0).getTime()
    const tasks = [
      task({ id: 'open-a', dueAt: due(12, 0) }),
      task({ id: 'open-b', dueAt: due(12, 15) }),
      task({ id: 'done-c', dueAt: due(12, 20), done: true }),
      task({ id: 'skipped-d', dueAt: due(12, 25), skipped: true }),
      task({ id: 'done-past', dueAt: due(9, 0), done: true }),
      task({ id: 'skipped-past', dueAt: due(8, 0), skipped: true }),
      task({ id: 'no-time' }),
    ]
    const stats = computeStats(tasks, ref)
    expect(stats.overdue).toBe(0)
    expect(stats.conflicts.overdue).toBe(0)
    expect(stats.conflicts.overlap).toBe(1) // 只有 open-a × open-b
    expect(stats.conflicts.clash).toBe(1) // 只有 open-a → open-b
    expect(stats.conflicts.pileup).toBe(0) // 当天只剩 2 件未完成
    expect(stats.conflicts.total).toBe(2)
  })
})


describe('v1.6 skipped 口径统一', () => {
  it('跳过的条目不进完成率分母、不算 open、单独计数', () => {
    const tasks = [
      task({ id: 'done', dueAt: at(11, 9), done: true }),
      task({ id: 'skip', dueAt: at(11, 10), skipped: true }),
      task({ id: 'open', dueAt: at(11, 11) }),
    ]
    const stats = computeStats(tasks, REF)
    expect(stats.weekTotal).toBe(2)
    expect(stats.doneThisWeek).toBe(1)
    expect(stats.completion).toBe(50)
    expect(stats.open).toBe(1)
    expect(stats.skipped).toBe(1)
    expect(stats.total).toBe(3)
  })
})

describe('v1.6 8 周完成趋势', () => {
  it('返回 8 个周点（旧→新），本周含跳过的排除', () => {
    const tasks = [
      task({ id: 'this-done', dueAt: at(11, 10), done: true }),
      task({ id: 'this-open', dueAt: at(11, 11) }),
      task({ id: 'this-skip', dueAt: at(11, 9), skipped: true }),
      task({ id: 'old-done', dueAt: at(10, 5), done: true }),
    ]
    const trend = completionTrend(tasks, REF)
    expect(trend).toHaveLength(8)
    expect(trend[7].weekStart).toBe(startOfWeek(REF))
    expect(trend[7].total).toBe(2)
    expect(trend[7].done).toBe(1)
    expect(trend[7].rate).toBe(50)
    expect(trend.some((point) => point.done === 1 && point.weekStart < trend[7].weekStart)).toBe(true)
    expect(trend[0].rate === null || typeof trend[0].rate === 'number').toBe(true)
  })
})

describe('v1.6 类型分布与延期完成率', () => {
  it('类型分布按数量降序', () => {
    const tasks = [
      task({ id: 'a', kind: 'task' }),
      task({ id: 'b', kind: 'task' }),
      task({ id: 'c', kind: 'meeting' }),
    ]
    expect(kindDistribution(tasks)).toEqual([
      { kind: 'task', count: 2 },
      { kind: 'meeting', count: 1 },
    ])
  })

  it('doneAt 晚于截止=延期；无 doneAt 的历史完成不进分母', () => {
    const tasks = [
      task({ id: 'late', dueAt: at(11, 10), done: true, doneAt: at(11, 11) }),
      task({ id: 'ontime', dueAt: at(11, 10), done: true, doneAt: at(11, 9) }),
      task({ id: 'legacy', dueAt: at(11, 9), done: true }),
      task({ id: 'open', dueAt: at(11, 9) }),
    ]
    const stats = computeStats(tasks, REF)
    expect(stats.doneTotal).toBe(3)
    expect(stats.doneWithTime).toBe(2)
    expect(stats.lateDone).toBe(1)
    expect(stats.lateRate).toBe(50)
  })
})
