import { describe, expect, it } from 'vitest'
import { migrateTaskV4toV5 } from './migrate.js'
import {
  allDayAnchor,
  isLocalMidnight,
  isSpanning,
  migrateTaskV2toV3,
  migrateTaskV3toV4,
  migrateSeriesV3toV4,
  primaryTime,
  spanDays,
  taskEndMs,
} from './migrate.js'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime()

describe('migrateTaskV2toV3', () => {
  it('点任务：补默认值、不改已有值', () => {
    const v2 = { id: 't1', title: '交报告', dueAt: at(2026, 11, 20, 18), startAt: null, done: false }
    const v3 = migrateTaskV2toV3(v2)
    expect(v3.endAt).toBeNull()
    expect(v3.rrule).toBeNull()
    expect(v3.allDay).toBe(false)
    expect(v3.seriesId).toBeNull()
    expect(v3.recurrenceIndex).toBe(0)
    expect(v3.skipped).toBe(false)
    expect(v3.dueAt).toBe(v2.dueAt)
    expect(v3.title).toBe('交报告')
  })

  it('老全天数据（dueAt=00:00）→ allDay=true，dueAt 原样保留', () => {
    const v2 = { id: 't2', title: '全天', dueAt: at(2026, 11, 20), startAt: null }
    const v3 = migrateTaskV2toV3(v2)
    expect(v3.allDay).toBe(true)
    expect(v3.dueAt).toBe(v2.dueAt)
    expect(v3.startAt).toBeNull()
  })

  it('定时事件保留 startAt，allDay=false', () => {
    const v3 = migrateTaskV2toV3({ id: 't3', title: '会议', startAt: at(2026, 11, 20, 9), dueAt: null })
    expect(v3.allDay).toBe(false)
  })

  it('幂等：连续迁移两次结果一致', () => {
    const once = migrateTaskV2toV3({ id: 't4', dueAt: at(2026, 11, 20) })
    const twice = migrateTaskV2toV3(once)
    expect(twice).toEqual(once)
  })

  it('迁移不丢字段', () => {
    const v2 = { id: 't5', title: 'x', dueAt: 1, done: true, editedFields: ['title'], sourceUid: 'u1' }
    const v3 = migrateTaskV2toV3(v2)
    expect(v3.done).toBe(true)
    expect(v3.editedFields).toEqual(['title'])
    expect(v3.sourceUid).toBe('u1')
  })
})

describe('时间形状辅助', () => {
  it('primaryTime：startAt 优先', () => {
    expect(primaryTime({ startAt: 2, dueAt: 1 })).toBe(2)
    expect(primaryTime({ startAt: null, dueAt: 1 })).toBe(1)
    expect(primaryTime({})).toBeNull()
  })

  it('allDayAnchor 兼容两代数据', () => {
    expect(allDayAnchor({ allDay: true, startAt: at(2026, 11, 20) })).toBe(at(2026, 11, 20))
    expect(allDayAnchor({ allDay: true, startAt: null, dueAt: at(2026, 11, 20) })).toBe(at(2026, 11, 20))
    expect(allDayAnchor({ allDay: false, dueAt: 1 })).toBeNull()
  })

  it('taskEndMs：区间优先，全天隐式次日，定时默认 30 分钟', () => {
    expect(taskEndMs({ startAt: at(2026, 11, 20, 9), endAt: at(2026, 11, 20, 11) })).toBe(at(2026, 11, 20, 11))
    expect(taskEndMs({ allDay: true, startAt: at(2026, 11, 20) })).toBe(at(2026, 11, 21))
    expect(taskEndMs({ startAt: at(2026, 11, 20, 9) })).toBe(at(2026, 11, 20, 9, 30))
  })

  it('spanDays：多日全天 3 天，跨天会议 2 天', () => {
    expect(spanDays({ allDay: true, startAt: at(2026, 11, 20), endAt: at(2026, 11, 23) })).toBe(3)
    expect(spanDays({ startAt: at(2026, 11, 20, 22), endAt: at(2026, 11, 21, 1) })).toBe(2)
    expect(spanDays({ startAt: at(2026, 11, 20, 9), endAt: at(2026, 11, 20, 11) })).toBe(1)
  })

  it('isSpanning', () => {
    expect(isSpanning({ startAt: at(2026, 11, 20, 22), endAt: at(2026, 11, 21, 1) })).toBe(true)
    expect(isSpanning({ startAt: at(2026, 11, 20, 9), endAt: at(2026, 11, 20, 11) })).toBe(false)
  })
})

describe('isLocalMidnight', () => {
  it('只认本地 00:00:00.000', () => {
    expect(isLocalMidnight(new Date(2026, 10, 20, 0, 0, 0, 0).getTime())).toBe(true)
    expect(isLocalMidnight(new Date(2026, 10, 20, 0, 0, 0, 1).getTime())).toBe(false)
    expect(isLocalMidnight(new Date(2026, 10, 20, 9, 0, 0, 0).getTime())).toBe(false)
  })
})


describe('v3 → v4（url / note）', () => {
  it('旧任务补 null，已有值保留，幂等', () => {
    const old = { id: 'a', title: '旧', url: 'https://x.example/a', note: '备注' }
    expect(migrateTaskV3toV4(old)).toEqual({ ...old })
    const bare = { id: 'b', title: 'b' }
    const migrated = migrateTaskV3toV4(bare)
    expect(migrated.url).toBeNull()
    expect(migrated.note).toBeNull()
    expect(migrateTaskV3toV4(migrated)).toEqual(migrated)
  })

  it('系列迁移同规则', () => {
    expect(migrateSeriesV3toV4({ id: 's', title: 's' })).toMatchObject({ url: null, note: null })
  })
})


describe('v1.6 v4 → v5 doneAt 迁移', () => {
  it('保留已有 doneAt；缺失补 null；幂等', () => {
    const kept = migrateTaskV4toV5({ id: 'a', doneAt: 123 })
    expect(kept.doneAt).toBe(123)
    const missing = migrateTaskV4toV5({ id: 'b' })
    expect(missing.doneAt).toBeNull()
    expect(migrateTaskV4toV5(missing as Record<string, unknown>).doneAt).toBeNull()
  })
})
