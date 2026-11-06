/**
 * 仓储层：UI 与会话状态只通过这组函数碰数据，不直接写 Dexie。
 * 好处是「换存储介质」不用改 UI —— 以后要同步到云端，只改这一层。
 */
import type { ImportBatch, ParsedTask, StoredTask } from 'shisui-core'
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

export async function recordBatch(batch: ImportBatch): Promise<void> {
  await db.batches.put(batch)
}

export async function listBatches(): Promise<ImportBatch[]> {
  return db.batches.orderBy('createdAt').reverse().toArray()
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.tasks, db.batches, async () => {
    await db.tasks.clear()
    await db.batches.clear()
  })
}

export interface Snapshot {
  version: 1
  exportedAt: string
  tasks: StoredTask[]
  batches: ImportBatch[]
}

/** 导出成 JSON：既是用户的数据备份，也是排查问题时能还原现场的证据 */
export async function exportSnapshot(): Promise<Snapshot> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: await db.tasks.toArray(),
    batches: await db.batches.toArray(),
  }
}

export async function importSnapshot(snapshot: Snapshot): Promise<void> {
  if (snapshot.version !== 1) throw new Error('不认识的备份版本')
  await db.transaction('rw', db.tasks, db.batches, async () => {
    await db.tasks.bulkPut(snapshot.tasks)
    await db.batches.bulkPut(snapshot.batches)
  })
}
