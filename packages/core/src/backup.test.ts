import { describe, expect, it } from 'vitest'
import { buildBackup, validateBackup, BACKUP_FORMAT, BACKUP_VERSION, BACKUP_SCHEMA_VERSION } from './backup.js'

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 't1',
  title: '交报告',
  dueAt: new Date(2026, 10, 20, 18).getTime(),
  startAt: null,
  kind: 'task' as const,
  channel: '邮箱',
  location: null,
  rawText: '周五交报告',
  confidence: 'high' as const,
  reasons: [],
  engine: 'rule' as const,
  createdAt: 1,
  done: false,
  editedFields: [],
  ...overrides,
})

const series = {
  id: 's1',
  rrule: 'FREQ=WEEKLY;BYDAY=FR',
  startAt: new Date(2026, 10, 6, 9).getTime(),
  title: '例会',
  kind: 'meeting' as const,
  createdAt: 1,
}

const batch = { id: 'b1', rawText: '原始通知', createdAt: 1, taskCount: 1, engine: 'rule' as const }

describe('buildBackup', () => {
  it('固定格式与版本，包含四块数据与 settings', () => {
    const backup = buildBackup({ tasks: [task()], series: [series], batches: [batch], now: Date.UTC(2026, 10, 8) })
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.backupVersion).toBe(BACKUP_VERSION)
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    expect(backup.appVersion).toBe('0.0.0')
    expect(backup.exportedAt).toBe('2026-11-08T00:00:00.000Z')
    expect(backup.tasks).toHaveLength(1)
    expect(backup.series).toHaveLength(1)
    expect(backup.batches).toHaveLength(1)
    expect(backup.settings).toEqual({})
  })

  it('不导出敏感设置（apiKey）', () => {
    const backup = buildBackup({
      tasks: [],
      series: [],
      batches: [],
      settings: { llm: { enabled: true, baseUrl: 'https://api.example.com', model: 'm' } },
    })
    expect(JSON.stringify(backup)).not.toContain('apiKey')
  })
})

describe('validateBackup', () => {
  it('合法备份 → 通过并规范化', () => {
    const backup = buildBackup({ tasks: [task()], series: [], batches: [], now: 1 })
    const result = validateBackup(JSON.stringify(backup))
    expect(result.ok).toBe(true)
    expect(result.backup?.tasks[0].title).toBe('交报告')
  })

  it('不是 JSON → 失败，给可读原因', () => {
    const result = validateBackup('oops, not json')
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('JSON')
    expect(result.backup).toBeNull()
  })

  it('被截断的 JSON → 专门提示（不误报成「不是 JSON」）', () => {
    const result = validateBackup('{"format":"shisui-backup","tasks":[{"id":"t1"')
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('不完整')
    expect(result.errors[0]).toContain('截断')
    expect(result.backup).toBeNull()
  })

  it('format 不对 → 拒绝', () => {
    const result = validateBackup({ format: 'other', schemaVersion: 1, tasks: [], series: [], batches: [] })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('不是拾穗备份')
  })

  it('版本过新 → 拒绝', () => {
    const result = validateBackup({
      format: BACKUP_FORMAT,
      backupVersion: BACKUP_VERSION + 1,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      tasks: [],
      series: [],
      batches: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('格式过新')
  })

  it('缺数组 → 拒绝', () => {
    const result = validateBackup({ format: BACKUP_FORMAT, schemaVersion: 1, tasks: [] })
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toContain('series')
  })

  it('任务缺 id/title → 拒绝整份备份（不部分写入）', () => {
    const result = validateBackup({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      tasks: [{ title: '没有 id' }],
      series: [],
      batches: [],
    })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('缺少 id 或 title')
  })

  it('v2 老备份（无新字段）→ 补默认值', () => {
    const result = validateBackup({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      tasks: [task()],
      series: [],
      batches: [],
    })
    const restored = result.backup!.tasks[0]
    expect(restored.endAt).toBeNull()
    expect(restored.rrule).toBeNull()
    expect(restored.seriesId).toBeNull()
    expect(restored.recurrenceIndex).toBe(0)
    expect(restored.skipped).toBe(false)
    expect(restored.tags).toEqual([])
  })

  it('未知字段被丢弃（白名单映射）', () => {
    const result = validateBackup({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      tasks: [task({ evil: 'x' })],
      series: [],
      batches: [],
    })
    expect(result.ok).toBe(true)
    expect('evil' in result.backup!.tasks[0]).toBe(false)
  })

  it('tags 去空白、去非字符串', () => {
    const result = validateBackup({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      tasks: [task({ tags: ['作业', '  ', 42, ' 复习 '] })],
      series: [],
      batches: [],
    })
    expect(result.backup!.tasks[0].tags).toEqual(['作业', '复习'])
  })
})
