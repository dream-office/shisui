/**
 * 仓储层：UI 与会话状态只通过这组函数碰数据，不直接写 Dexie。
 * 好处是「换存储介质」不用改 UI —— 以后要同步到云端，只改这一层。
 */
import type { ImportBatch, ParsedTask, StoredTask, TaskSeries } from 'shisui-core'
import { db } from './db'

export async function listTasks(): Promise<StoredTask[]> {
  return db.tasks.orderBy('createdAt').reverse().toArray()
}

export async function insertTasks(parsed: ParsedTask[]): Promise<StoredTask[]> {
  const now = Date.now()
  const rows: StoredTask[] = parsed.map((task) => ({
    ...task,
    createdAt: now,
    done: false,
    editedFields: [],
  }))
  await db.tasks.bulkPut(rows)
  return rows
}

export async function updateTask(id: string, patch: Partial<StoredTask> & { editedField?: string }): Promise<void> {
  const { editedField, ...rest } = patch
  const current = await db.tasks.get(id)
  if (!current) return
  const editedFields = editedField
    ? Array.from(new Set([...current.editedFields, editedField]))
    : current.editedFields
  await db.tasks.put({ ...current, ...rest, editedFields })
}

export async function setDone(id: string, done: boolean): Promise<void> {
  await db.tasks.update(id, { done })
}

export async function removeTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}

export async function listSeries(): Promise<TaskSeries[]> {
  return db.series.orderBy('startAt').toArray()
}

export async function getSeries(id: string): Promise<TaskSeries | undefined> {
  return db.series.get(id)
}

/** 创建系列 + 首条实例（同一事务，避免只写一半） */
export async function createSeriesWithTask(series: TaskSeries, task: ParsedTask): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.tasks, db.series, async () => {
    await db.series.put(series)
    await db.tasks.put({ ...task, createdAt: now, done: false, editedFields: [] } as StoredTask)
  })
}

/** 同系列同序号的实例是否已存在（幂等） */
export async function hasInstance(seriesId: string, recurrenceIndex: number): Promise<boolean> {
  const found = await db.tasks.where('seriesId').equals(seriesId).toArray()
  return found.some((task) => (task.recurrenceIndex ?? 0) === recurrenceIndex)
}

/**
 * 完成/跳过当前实例，并在同一事务里写入下一次实例。
 * 幂等：目标序号的实例已存在时不再写入。
 */
export async function settleRecurringInstance(input: {
  taskId: string
  mode: 'done' | 'skip'
  nextTask: ParsedTask | null
  seriesPatch?: Partial<TaskSeries>
}): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.tasks, db.series, async () => {
    const current = await db.tasks.get(input.taskId)
    if (!current) return
    await db.tasks.put({
      ...current,
      done: input.mode === 'done' ? true : current.done,
      skipped: input.mode === 'skip' ? true : current.skipped,
      editedFields: current.editedFields,
    })

    if (input.nextTask) {
      const seriesId = input.nextTask.seriesId ?? ''
      const nextIndex = input.nextTask.recurrenceIndex ?? 0
      const existing = await db.tasks.where('seriesId').equals(seriesId).toArray()
      const duplicated = existing.some((task) => (task.recurrenceIndex ?? 0) === nextIndex)
      if (!duplicated) {
        await db.tasks.put({ ...input.nextTask, createdAt: now, done: false, editedFields: [] } as StoredTask)
      }
    }

    if (input.seriesPatch && current.seriesId) {
      const series = await db.series.get(current.seriesId)
      if (series) await db.series.put({ ...series, ...input.seriesPatch })
    }
  })
}

/** 结束系列：标记 endedAt，删除「未来未完成」的实例；已完成/已跳过历史保留 */
export async function endSeries(seriesId: string, currentIndex: number): Promise<void> {
  await db.transaction('rw', db.tasks, db.series, async () => {
    const series = await db.series.get(seriesId)
    if (series) await db.series.put({ ...series, endedAt: Date.now() })

    const instances = await db.tasks.where('seriesId').equals(seriesId).toArray()
    const future = instances.filter(
      (task) => (task.recurrenceIndex ?? 0) > currentIndex && !task.done,
    )
    await db.tasks.bulkDelete(future.map((task) => task.id))
  })
}

export async function recordBatch(batch: ImportBatch): Promise<void> {
  await db.batches.put(batch)
}

export async function listBatches(): Promise<ImportBatch[]> {
  return db.batches.orderBy('createdAt').reverse().toArray()
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.tasks, db.batches, db.series, async () => {
    await db.tasks.clear()
    await db.batches.clear()
    await db.series.clear()
  })
}

/** ICS 导入的落库：一个事务里完成全部插入与更新，中途失败不会留下半截数据 */
export async function applyIcsPlan(plan: {
  toInsert: ParsedTask[]
  toUpdate: ParsedTask[]
}): Promise<void> {
  const now = Date.now()
  const inserted: StoredTask[] = plan.toInsert.map((task) => ({
    ...task,
    createdAt: now,
    done: false,
    editedFields: [],
  }))

  await db.transaction('rw', db.tasks, async () => {
    if (inserted.length > 0) await db.tasks.bulkPut(inserted)
    for (const task of plan.toUpdate) {
      const current = await db.tasks.get(task.id)
      if (!current) continue
      await db.tasks.put({
        ...current,
        title: task.title,
        dueAt: task.dueAt,
        startAt: task.startAt,
        kind: task.kind,
        location: task.location,
        rawText: task.rawText,
        sourceUid: task.sourceUid ?? current.sourceUid ?? null,
      })
    }
  })
}

export interface Snapshot {
  version: 1
  exportedAt: string
  tasks: StoredTask[]
  batches: ImportBatch[]
  /** v3 新增；老备份没有该字段时按空数组处理 */
  series?: TaskSeries[]
}

/** 导出成 JSON：既是用户的数据备份，也是排查问题时能还原现场的证据 */
export async function exportSnapshot(): Promise<Snapshot> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: await db.tasks.toArray(),
    batches: await db.batches.toArray(),
    series: await db.series.toArray(),
  }
}

export async function importSnapshot(snapshot: Snapshot): Promise<void> {
  if (snapshot.version !== 1) throw new Error('不认识的备份版本')
  await db.transaction('rw', db.tasks, db.batches, db.series, async () => {
    await db.tasks.bulkPut(snapshot.tasks)
    await db.batches.bulkPut(snapshot.batches)
    await db.series.bulkPut(snapshot.series ?? [])
  })
}
