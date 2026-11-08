/**
 * 应用层测试（fake-indexeddb，无浏览器）：
 * 完成重复任务时，下一次必须从 series.anchorDay / series.rrule 推算，
 * 不能从当前任务的 dueAt 反推（否则 1/31 → 2/28 → 3/28，丢掉锚定的 31 号）。
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

describe('store 完成语义：月末锚定从 series 读', () => {
  beforeEach(async () => {
    const repo = await import('@/data/repo')
    await repo.clearAll()
  })

  it('1/31 → 2/28 → 3/31（编辑/迁移后仍回到 31）', async () => {
    const { parseNotice } = await import('shisui-core')
    const { useApp } = await import('./store')
    const repo = await import('@/data/repo')

    const parsed = parseNotice('每月31号交房租', new Date(2026, 0, 31, 9, 0, 0))
    expect(parsed.tasks).toHaveLength(1)
    const candidate = parsed.tasks[0]
    expect(candidate.rrule).toContain('BYMONTHDAY=31')

    // 走真实 UI 路径：候选 → 收录（创建 series + 首条实例）
    useApp.setState({ candidates: [candidate] })
    await useApp.getState().acceptCandidates([candidate.id])

    let tasks = await repo.listTasks()
    expect(tasks).toHaveLength(1)
    expect(new Date(tasks[0].dueAt!).getMonth()).toBe(0) // 1 月
    expect(new Date(tasks[0].dueAt!).getDate()).toBe(31)

    // 完成第一条 → 下一条 2 月 28（短月 clamp）
    await useApp.getState().completeTask(tasks[0].id)
    tasks = await repo.listTasks()
    const feb = tasks.find((task) => !task.done)!
    expect(new Date(feb.dueAt!).getMonth()).toBe(1)
    expect(new Date(feb.dueAt!).getDate()).toBe(28)
    expect(feb.recurrenceIndex).toBe(1)

    // 完成 2/28 → 下一条必须是 3/31（锚定原始日，不是 3/28）
    await useApp.getState().completeTask(feb.id)
    tasks = await repo.listTasks()
    const active = tasks.filter((task) => !task.done)
    expect(active).toHaveLength(1)
    expect(new Date(active[0].dueAt!).getMonth()).toBe(2)
    expect(new Date(active[0].dueAt!).getDate()).toBe(31)
    expect(active[0].recurrenceIndex).toBe(2)
  })

  it('COUNT 用尽后不再生成（完成第 3 次即停）', async () => {
    const { parseNotice } = await import('shisui-core')
    const { useApp } = await import('./store')
    const repo = await import('@/data/repo')

    const parsed = parseNotice('每月31号交房租，共3次', new Date(2026, 0, 31, 9, 0, 0))
    const candidate = parsed.tasks[0]
    expect(candidate.rrule).toContain('COUNT=3')

    useApp.setState({ candidates: [candidate] })
    await useApp.getState().acceptCandidates([candidate.id])

    let tasks = await repo.listTasks()
    await useApp.getState().completeTask(tasks[0].id) // 1 → 2
    tasks = await repo.listTasks()
    const second = tasks.find((task) => !task.done)!
    await useApp.getState().completeTask(second.id) // 2 → 3
    tasks = await repo.listTasks()
    const third = tasks.find((task) => !task.done)!
    expect(third.recurrenceIndex).toBe(2)

    await useApp.getState().completeTask(third.id) // 第 3 次完成 → 系列结束
    tasks = await repo.listTasks()
    expect(tasks.filter((task) => !task.done)).toHaveLength(0)
    expect(tasks.filter((task) => task.done)).toHaveLength(3)
  })

  it('完成 → 取消 → 再完成：不重复生成（幂等）', async () => {
    const { parseNotice } = await import('shisui-core')
    const { useApp } = await import('./store')
    const repo = await import('@/data/repo')

    const parsed = parseNotice('每周五9点例会', new Date(2026, 10, 6, 8, 0, 0))
    const candidate = parsed.tasks[0]
    useApp.setState({ candidates: [candidate] })
    await useApp.getState().acceptCandidates([candidate.id])

    const first = (await repo.listTasks())[0]
    await useApp.getState().completeTask(first.id)
    expect((await repo.listTasks()).filter((task) => !task.done)).toHaveLength(1)

    // 取消完成（不删下一条），再完成一次
    await useApp.getState().toggleDone(first.id)
    await useApp.getState().completeTask(first.id)

    const active = (await repo.listTasks()).filter((task) => !task.done)
    expect(active).toHaveLength(1) // 仍然只有一条下一条，没有翻倍
  })
})
