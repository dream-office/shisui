/**
 * 应用层测试（fake-indexeddb）：v0.9 备份/恢复、批量+撤销、标签、专注模式。
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BACKUP_FORMAT } from 'shisui-core'

const makeTasks = async (useApp: typeof import('./store')['useApp']) => {
  const { parseNotice } = await import('shisui-core')
  const repo = await import('@/data/repo')
  const parsed = parseNotice('周五前交报告；周一开会', new Date(2026, 10, 8, 9, 0, 0))
  useApp.setState({ candidates: parsed.tasks })
  await useApp.getState().acceptCandidates(parsed.tasks.map((task) => task.id))
  return repo.listTasks()
}

describe('v0.9 备份 / 恢复', () => {
  beforeEach(async () => {
    const repo = await import('@/data/repo')
    await repo.clearAll()
  })

  it('导出 → 清空 → 恢复：任务、系列、历史都回来', async () => {
    const { useApp } = await import('./store')
    const repo = await import('@/data/repo')
    await makeTasks(useApp)

    const parsed = (await import('shisui-core')).parseNotice('每周五9点例会', new Date(2026, 10, 6, 8, 0, 0))
    useApp.setState({ candidates: parsed.tasks })
    await useApp.getState().acceptCandidates(parsed.tasks.map((task) => task.id))

    const text = useApp.getState().exportBackup()
    const backup = JSON.parse(text)
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.tasks.length).toBeGreaterThan(0)
    expect(backup.series.length).toBe(1)
    expect(JSON.stringify(backup)).not.toContain('apiKey')

    await repo.clearAll()
    expect(await repo.listTasks()).toHaveLength(0)

    const result = await useApp.getState().restoreBackup(text)
    expect(result.ok).toBe(true)
    expect((await repo.listTasks()).length).toBe(backup.tasks.length)
    expect((await repo.listSeries()).length).toBe(1)
  })

  it('非法备份：不改动现有数据', async () => {
    const { useApp } = await import('./store')
    const repo = await import('@/data/repo')
    const before = await makeTasks(useApp)
    const result = await useApp.getState().restoreBackup('{not json')
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('JSON')
    expect(await repo.listTasks()).toHaveLength(before.length)
  })

  it('旧备份缺字段：恢复时补默认值', async () => {
    const { useApp } = await import('./store')
    const repo = await import('@/data/repo')
    const result = await useApp.getState().restoreBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        schemaVersion: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            id: 'old1',
            title: '老任务',
            dueAt: new Date(2026, 10, 20, 18).getTime(),
            startAt: null,
            kind: 'task',
            createdAt: 1,
            done: false,
          },
        ],
        series: [],
        batches: [],
      }),
    )
    expect(result.ok).toBe(true)
    const task = (await repo.listTasks())[0]
    expect(task.tags).toEqual([])
    expect(task.endAt).toBeNull()
    expect(task.recurrenceIndex).toBe(0)
  })
})

describe('v0.9 批量操作 / 撤销', () => {
  beforeEach(async () => {
    const repo = await import('@/data/repo')
    await repo.clearAll()
  })

  it('批量完成 → 撤销：状态恢复', async () => {
    const { useApp } = await import('./store')
    const repo = await import('@/data/repo')
    const tasks = await makeTasks(useApp)
    const ids = tasks.map((task) => task.id)

    await useApp.getState().batchSetDone(ids, true)
    expect((await repo.listTasks()).every((task) => task.done)).toBe(true)
    expect(useApp.getState().undo?.label).toContain('批量完成')

    await useApp.getState().undoLastBatch()
    expect((await repo.listTasks()).every((task) => !task.done)).toBe(true)
    expect(useApp.getState().undo).toBeNull()
  })

  it('批量删除 → 撤销：整条恢复', async () => {
    const { useApp } = await import('./store')
    const repo = await import('@/data/repo')
    const tasks = await makeTasks(useApp)
    const ids = tasks.map((task) => task.id)
    const before = tasks.length

    await useApp.getState().batchDelete(ids)
    expect(await repo.listTasks()).toHaveLength(0)
    await useApp.getState().undoLastBatch()
    const restored = await repo.listTasks()
    expect(restored).toHaveLength(before)
    expect(restored.map((task) => task.title).sort()).toEqual(tasks.map((task) => task.title).sort())
  })
})

describe('v0.9 标签', () => {
  beforeEach(async () => {
    const repo = await import('@/data/repo')
    await repo.clearAll()
  })

  it('设置标签并持久化（去重、去 #）', async () => {
    const { useApp } = await import('./store')
    const repo = await import('@/data/repo')
    const tasks = await makeTasks(useApp)
    const id = tasks[0].id
    await useApp.getState().setTags(id, ['#作业', '作业', ' 复习 '])
    const task = (await repo.listTasks()).find((item) => item.id === id)
    expect(task?.tags).toEqual(['作业', '复习'])
  })
})

describe('v0.9 专注模式', () => {
  beforeEach(async () => {
    const repo = await import('@/data/repo')
    await repo.clearAll()
  })

  it('完成当前任务 → 只留一个未完成；重复任务生成下一条', async () => {
    const { useApp } = await import('./store')
    const repo = await import('@/data/repo')
    const { parseNotice } = await import('shisui-core')

    const parsed = parseNotice('每周五9点例会', new Date(2026, 10, 6, 8, 0, 0))
    useApp.setState({ candidates: parsed.tasks })
    await useApp.getState().acceptCandidates(parsed.tasks.map((task) => task.id))

    useApp.getState().openFocus()
    expect(useApp.getState().focusMode).toBe(true)
    await useApp.getState().focusComplete()

    const tasks = await repo.listTasks()
    expect(tasks.filter((task) => task.done)).toHaveLength(1)
    // 重复任务完成 → 自动生成下一条（复用重复系列语义）
    expect(tasks.filter((task) => !task.done)).toHaveLength(1)
    expect(tasks.find((task) => !task.done)?.recurrenceIndex).toBe(1)
    useApp.getState().closeFocus()
  })
})
