import { describe, expect, it } from 'vitest'
import { createManualTask } from './manual.js'

describe('createManualTask', () => {
  it('用截止时间构造一条待办', () => {
    const due = new Date(2026, 10, 20, 18, 0).getTime()
    const task = createManualTask({ title: '  交报销单  ', dueAt: due }, 't1')

    expect(task.id).toBe('t1')
    expect(task.title).toBe('交报销单')
    expect(task.dueAt).toBe(due)
    expect(task.startAt).toBeNull()
    expect(task.kind).toBe('task')
    expect(task.engine).toBe('manual')
    expect(task.confidence).toBe('high')
    expect(task.reasons[0]).toContain('手动添加')
  })

  it('用开始时间构造会议，保留类型/渠道/地点', () => {
    const start = new Date(2026, 10, 21, 9, 0).getTime()
    const task = createManualTask(
      { title: '周会', startAt: start, kind: 'meeting', channel: '腾讯会议', location: '3 楼会议室' },
      't2',
    )

    expect(task.startAt).toBe(start)
    expect(task.dueAt).toBeNull()
    expect(task.kind).toBe('meeting')
    expect(task.channel).toBe('腾讯会议')
    expect(task.location).toBe('3 楼会议室')
  })

  it('备注会进 rawText，方便以后核对', () => {
    const task = createManualTask(
      { title: '补材料', dueAt: 1, notes: '辅导员口头通知，没有原文' },
      't3',
    )
    expect(task.rawText).toBe('[手动添加] 辅导员口头通知，没有原文')
  })

  it('标题为空要报错', () => {
    expect(() => createManualTask({ title: '   ', dueAt: 1 }, 't4')).toThrow('标题不能为空')
  })

  it('两个时间都没填要报错', () => {
    expect(() => createManualTask({ title: '没时间的事' }, 't5')).toThrow('至少填一个时间')
  })
})
