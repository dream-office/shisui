/**
 * 本地优先存储：所有数据只落在用户自己的浏览器 IndexedDB 里，没有后端、没有上传。
 * 这不只是「省事」，而是这个产品的隐私卖点 —— 班级群通知里往往有学号、手机号、成绩。
 */
import Dexie, { type Table } from 'dexie'
import { migrateTaskV2toV3 } from 'shisui-core'
import type { ImportBatch, StoredTask, TaskSeries } from 'shisui-core'

export class ShisuiDB extends Dexie {
  tasks!: Table<StoredTask, string>
  batches!: Table<ImportBatch, string>
  series!: Table<TaskSeries, string>

  constructor() {
    super('shisui')
    this.version(1).stores({
      // 索引：截止时间用于日程排序，done 用于过滤，createdAt 用于导出排序
      tasks: 'id, dueAt, startAt, done, kind, createdAt',
      batches: 'id, createdAt',
    })
    // v2：ICS 导入去重用 sourceUid（只加索引，不改动已有行；老数据该字段为空）
    this.version(2).stores({
      tasks: 'id, dueAt, startAt, done, kind, createdAt, sourceUid',
      batches: 'id, createdAt',
    })
    // v3：重复任务 + 多日区间。只补字段默认值与新表，不改写老值。
    this.version(3)
      .stores({
        tasks: 'id, dueAt, startAt, endAt, done, kind, createdAt, sourceUid, seriesId, allDay',
        batches: 'id, createdAt',
        series: 'id, startAt',
      })
      .upgrade((tx) =>
        tx
          .table('tasks')
          .toCollection()
          .modify((task: Record<string, unknown>) => {
            Object.assign(task, migrateTaskV2toV3(task))
          }),
      )
  }
}

export const db = new ShisuiDB()
