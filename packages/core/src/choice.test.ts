import { describe, expect, it } from 'vitest'
import { defaultChoiceSelection, toggleChoiceSelection } from './choice.js'
import type { ParsedTask } from './types.js'

const REF: ParsedTask[] = [
  {
    id: 'this-week',
    title: '交周报',
    dueAt: 1,
    startAt: null,
    kind: 'task',
    channel: null,
    location: null,
    rawText: '交周报',
    confidence: 'low',
    reasons: [],
    engine: 'rule',
    choiceGroup: '本周日|2026-11-08',
    choiceLabel: '本周',
  },
  {
    id: 'next-week',
    title: '交周报',
    dueAt: 2,
    startAt: null,
    kind: 'task',
    channel: null,
    location: null,
    rawText: '交周报',
    confidence: 'low',
    reasons: [],
    engine: 'rule',
    choiceGroup: '本周日|2026-11-08',
    choiceLabel: '下周',
  },
  {
    id: 'plain',
    title: '交材料',
    dueAt: 3,
    startAt: null,
    kind: 'task',
    channel: null,
    location: null,
    rawText: '交材料',
    confidence: 'high',
    reasons: [],
    engine: 'rule',
  },
]

describe('defaultChoiceSelection', () => {
  it('两组默认选「本周」，普通任务全选', () => {
    const selected = defaultChoiceSelection(REF)
    expect(selected).toContain('this-week')
    expect(selected).not.toContain('next-week')
    expect(selected).toContain('plain')
  })

  it('没有「本周」标签时选组内第一个', () => {
    const tasks = REF.map((task) =>
      task.id === 'this-week' ? { ...task, choiceLabel: '候选一' } : task,
    )
    const selected = defaultChoiceSelection(tasks)
    expect(selected).toContain('this-week')
  })
})

describe('toggleChoiceSelection（组内互斥）', () => {
  it('选「下周」会自动取消「本周」', () => {
    const current = defaultChoiceSelection(REF)
    const next = toggleChoiceSelection(current, REF[1], REF)
    expect(next).toContain('next-week')
    expect(next).not.toContain('this-week')
  })

  it('再点一次取消勾选', () => {
    const current = defaultChoiceSelection(REF)
    const next = toggleChoiceSelection(current, REF[0], REF)
    expect(next).not.toContain('this-week')
  })

  it('普通任务互不影响', () => {
    const current = defaultChoiceSelection(REF)
    const next = toggleChoiceSelection(current, REF[2], REF)
    expect(next).not.toContain('plain')
    expect(next).toContain('this-week')
  })

  it('不相干的组不受影响', () => {
    const other: ParsedTask = {
      ...REF[0],
      id: 'other-this',
      choiceGroup: '下周日|2026-11-15',
    }
    const otherNext: ParsedTask = {
      ...REF[1],
      id: 'other-next',
      choiceGroup: '下周日|2026-11-15',
    }
    const tasks = [...REF, other, otherNext]
    const current = defaultChoiceSelection(tasks)
    const next = toggleChoiceSelection(current, REF[1], tasks)
    expect(next).toContain('other-this')
    expect(next).not.toContain('other-next')
  })
})
