
import { describe, expect, it } from 'vitest'
import { mergeTasks } from './merge.js'
import type { ParsedTask } from './types.js'

const DAY = new Date(2026, 10, 10, 23, 59).getTime()

function task(patch: Partial<ParsedTask> & { id: string; title: string }): ParsedTask {
  return {
    dueAt: DAY,
    startAt: null,
    kind: 'task',
    channel: null,
    location: null,
    rawText: patch.title,
    confidence: 'medium',
    reasons: [],
    engine: 'rule',
    ...patch,
  }
}

describe('v1.1.3 双引擎合并去重', () => {
  it('规则 + AI 同一件事 → 1 条 hybrid', () => {
    const report = mergeTasks(
      [task({ id: 'r1', title: '统计缺页教材数量并反馈' })],
      [task({ id: 'l1', title: '统计缺页教材数量并反馈（留存影像）', engine: 'llm' })],
    )
    expect(report.tasks).toHaveLength(1)
    expect(report.tasks[0].engine).toBe('hybrid')
    expect(report.agreedCount).toBe(1)
  })

  it('同一天同 kind 但标题不同 → 不合并', () => {
    const report = mergeTasks(
      [task({ id: 'r1', title: '语文作业' })],
      [task({ id: 'l1', title: '数学作业', engine: 'llm' })],
    )
    expect(report.tasks).toHaveLength(2)
    expect(report.agreedCount).toBe(0)
  })

  it('AI 自己重复的两行合并为 1 条', () => {
    const report = mergeTasks(
      [],
      [
        task({ id: 'l1', title: '完成军事理论课学习与考试', kind: 'exam', engine: 'llm' }),
        task({ id: 'l2', title: '完成军事理论课学习与考试。', kind: 'exam', engine: 'llm' }),
      ],
    )
    expect(report.tasks).toHaveLength(1)
  })

  it('URL 形式的 channel/location 被丢弃', () => {
    const report = mergeTasks(
      [],
      [
        task({
          id: 'l1',
          title: '完成学习',
          channel: 'https://example.com/a',
          location: 'https://example.com/b',
          engine: 'llm',
        }),
      ],
    )
    expect(report.tasks[0].channel).toBeNull()
    expect(report.tasks[0].location).toBeNull()
  })
})
