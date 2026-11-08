import { describe, expect, it } from 'vitest'
import { clockOf, editablePatch, instancesToSync, withClock } from './seriesEdit.js'

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 't',
  seriesId: 's1',
  recurrenceIndex: 0,
  done: false,
  skipped: false,
  ...overrides,
})

describe('instancesToSync', () => {
  it('只同步同系列、序号 >= 当前、未完成未跳过的实例', () => {
    const tasks = [
      task({ id: 'old-done', recurrenceIndex: 0, done: true }),
      task({ id: 'old-skipped', recurrenceIndex: 1, skipped: true }),
      task({ id: 'current', recurrenceIndex: 2 }),
      task({ id: 'future', recurrenceIndex: 3 }),
      task({ id: 'other-series', seriesId: 's2', recurrenceIndex: 2 }),
      task({ id: 'no-series', seriesId: null }),
    ]
    expect(instancesToSync(tasks, 's1', 2).map((item) => item.id)).toEqual(['current', 'future'])
  })

  it('历史（已完成/已跳过）不动', () => {
    const tasks = [
      task({ id: 'done', recurrenceIndex: 5, done: true }),
      task({ id: 'skipped', recurrenceIndex: 6, skipped: true }),
      task({ id: 'active', recurrenceIndex: 7 }),
    ]
    expect(instancesToSync(tasks, 's1', 5).map((item) => item.id)).toEqual(['active'])
  })
})

describe('editablePatch', () => {
  it('只包含显式传入的字段', () => {
    expect(editablePatch({ title: ' 新标题 ' })).toEqual({ title: '新标题' })
  })

  it('channel/location 去空白，空串转 null', () => {
    expect(editablePatch({ channel: '  ', location: ' 3 楼 ' })).toEqual({ channel: null, location: '3 楼' })
  })

  it('tags 原样传递（归一由 store/rep 层负责）', () => {
    expect(editablePatch({ tags: ['作业'] })).toEqual({ tags: ['作业'] })
  })
})


describe('clockOf / withClock（改整个系列只改时刻）', () => {
  it('只换时刻，日期不变', () => {
    const original = new Date(2026, 10, 6, 9, 0, 0).getTime()
    const clock = clockOf(new Date(2026, 10, 20, 10, 30, 0).getTime())
    const next = withClock(original, clock)
    const d = new Date(next)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(10)
    expect(d.getDate()).toBe(6) // 日期保持
    expect(d.getHours()).toBe(10)
    expect(d.getMinutes()).toBe(30)
  })
})
