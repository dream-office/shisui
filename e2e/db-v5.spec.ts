
import { expect, test } from '@playwright/test'

test.describe('v1.6 DB v4 → v5 真实迁移', () => {
  test('seed v4 旧库 → 打开应用 → doneAt 补 null，旧字段保留，不报错', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    // 不加载应用，先造一个 v4 的 IndexedDB（Dexie 的 IndexedDB version = 4*10 = 40）
    await page.goto('/manifest.webmanifest')
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('shisui')
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      })
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('shisui', 40)
        req.onupgradeneeded = () => {
          const db = req.result
          const tasks = db.createObjectStore('tasks', { keyPath: 'id' })
          for (const idx of ['dueAt', 'startAt', 'endAt', 'done', 'kind', 'createdAt', 'sourceUid', 'seriesId', 'allDay']) {
            tasks.createIndex(idx, idx)
          }
          const batches = db.createObjectStore('batches', { keyPath: 'id' })
          batches.createIndex('createdAt', 'createdAt')
          const series = db.createObjectStore('series', { keyPath: 'id' })
          series.createIndex('startAt', 'startAt')
        }
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['tasks', 'batches', 'series'], 'readwrite')
          tx.objectStore('tasks').put({
            id: 'v4_done',
            title: 'v4 已完成任务',
            dueAt: new Date(2026, 10, 10, 12, 0, 0).getTime(),
            startAt: null,
            endAt: null,
            allDay: false,
            rrule: null,
            seriesId: null,
            recurrenceIndex: 0,
            skipped: false,
            tags: ['v4'],
            kind: 'task',
            channel: null,
            location: null,
            url: 'https://example.com/v4',
            note: 'v4 note',
            rawText: 'v4 raw',
            confidence: 'high',
            reasons: ['v4 reason'],
            engine: 'rule',
            sourceUid: null,
            createdAt: 1,
            done: true,
            editedFields: [],
          })
          tx.objectStore('batches').put({
            id: 'batch_v4',
            rawText: 'v4 batch',
            createdAt: 1,
            taskCount: 1,
            engine: 'rule',
          })
          tx.objectStore('series').put({
            id: 'series_v4',
            rrule: 'FREQ=WEEKLY',
            startAt: 1,
            title: 'v4 series',
            kind: 'task',
            createdAt: 1,
          })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      })
    })

    // 打开应用 → Dexie 自动跑 v5 upgrade
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '拾穗' })).toBeVisible()
    const record = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('shisui')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const tx = db.transaction(['tasks', 'batches', 'series'], 'readonly')
      const get = (store: string, id: string) =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const req = tx.objectStore(store).get(id)
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })
      const version = db.version
      const task = await get('tasks', 'v4_done')
      const batch = await get('batches', 'batch_v4')
      const series = await get('series', 'series_v4')
      db.close()
      return { version, task, batch, series }
    })

    expect(record.version).toBe(50)
    expect(record.task.title).toBe('v4 已完成任务')
    expect(record.task.done).toBe(true)
    expect(record.task.doneAt).toBeNull()
    expect(record.task.url).toBe('https://example.com/v4')
    expect(record.task.note).toBe('v4 note')
    expect(record.task.tags).toEqual(['v4'])
    expect(record.batch.rawText).toBe('v4 batch')
    expect(record.series.title).toBe('v4 series')
    expect(errors).toEqual([])
  })
})
