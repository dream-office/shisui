import { describe, expect, it } from 'vitest'
import { sortFocusQueue } from './focus.js'

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 't',
  title: 'x',
  done: false,
  skipped: false,
  startAt: null as number | null,
  dueAt: null as number | null,
  createdAt: 0,
  ...overrides,
})

describe('sortFocusQueue', () => {
  it('排除已完成与已跳过', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b', done: true }), task({ id: 'c', skipped: true })]
    expect(sortFocusQueue(tasks).map((item) => item.id)).toEqual(['a'])
  })

  it('按主时刻最近优先（startAt 优先于 dueAt）', () => {
    const tasks = [
      task({ id: 'late', dueAt: 3000 }),
      task({ id: 'early', dueAt: 1000 }),
      task({ id: 'start', startAt: 2000 }),
    ]
    expect(sortFocusQueue(tasks).map((item) => item.id)).toEqual(['early', 'start', 'late'])
  })

  it('同一时刻按 createdAt 早的在前', () => {
    const tasks = [task({ id: 'new', dueAt: 1000, createdAt: 200 }), task({ id: 'old', dueAt: 1000, createdAt: 100 })]
    expect(sortFocusQueue(tasks).map((item) => item.id)).toEqual(['old', 'new'])
  })

  it('不改入参顺序', () => {
    const tasks = [task({ id: 'late', dueAt: 200 }), task({ id: 'early', dueAt: 100 })]
    sortFocusQueue(tasks)
    expect(tasks.map((item) => item.id)).toEqual(['late', 'early'])
  })
})
