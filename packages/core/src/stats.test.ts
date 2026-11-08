import { describe, expect, it } from 'vitest'
import { computeStats, startOfWeek } from './stats.js'
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
