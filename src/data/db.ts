/**
 * 本地优先存储：所有数据只落在用户自己的浏览器 IndexedDB 里，没有后端、没有上传。
 * 这不只是「省事」，而是这个产品的隐私卖点 —— 班级群通知里往往有学号、手机号、成绩。
 */
import Dexie, { type Table } from 'dexie'
import type { ImportBatch, StoredTask } from 'shisui-core'

export class ShisuiDB extends Dexie {
  tasks!: Table<StoredTask, string>
  batches!: Table<ImportBatch, string>

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
  }
}

export const db = new ShisuiDB()
