/**
 * JSON 备份 / 恢复（纯函数）：
 * - 导出：固定格式 + schemaVersion + 导出时间 + 数据快照
 * - 恢复：**先完整校验，再交给调用方落库**；非法文件绝不改动现有数据
 * - 兼容：v2/v3 旧备份缺新字段时补默认值（复用 migrateTaskV2toV3），未知字段一律丢弃
 *
 * 安全取舍：恢复时按白名单逐字段映射，不把备份 JSON 原样 spread 进数据库，
 * 避免恶意/损坏文件带进多余字段或原型污染。
 */
import type { ImportBatch, ParsedTask, StoredTask, TaskSeries } from './types.js'
import { migrateTaskV2toV3 } from './migrate.js'

export const BACKUP_FORMAT = 'shisui-backup'
/** 备份格式版本：未来格式升级时递增；旧版本仍可导入 */
export const BACKUP_VERSION = 1
/** 备份数据对应的 DB 版本（当前 v3） */
export const BACKUP_SCHEMA_VERSION = 3

export interface BackupSettings {
  /** 只备份非敏感偏好（不导出 AI apiKey） */
  llm?: { enabled?: boolean; baseUrl?: string; model?: string }
}

export interface ShisuiBackup {
  format: typeof BACKUP_FORMAT
  /** 备份格式版本 */
  backupVersion: number
  /** 生成备份的应用版本 */
  appVersion: string
  /** 数据对应的 DB 版本 */
  schemaVersion: number
  exportedAt: string
  tasks: StoredTask[]
  series: TaskSeries[]
  batches: ImportBatch[]
  settings: BackupSettings
}

export interface BackupValidation {
  ok: boolean
  errors: string[]
  backup: ShisuiBackup | null
}

export interface BackupInput {
  appVersion?: string
  tasks: readonly ParsedTask[] | readonly StoredTask[]
  series: readonly TaskSeries[]
  batches: readonly ImportBatch[]
  settings?: BackupSettings
  now?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 白名单映射一条任务；缺字段按 v2/v3 迁移默认补齐；未知字段丢弃 */
function normalizeTask(raw: unknown, index: number, errors: string[]): StoredTask | null {
  if (!isRecord(raw)) {
    errors.push(`第 ${index + 1} 条任务不是对象`)
    return null
  }
  const id = asString(raw.id)
  const title = asString(raw.title)
  if (!id || !title) {
    errors.push(`第 ${index + 1} 条任务缺少 id 或 title`)
    return null
  }

  const dueAt = asNumberOrNull(raw.dueAt)
  const startAt = asNumberOrNull(raw.startAt)
  const endAt = asNumberOrNull(raw.endAt)
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()

  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        .map((tag) => tag.trim().replace(/^#+/, '').toLowerCase())
    : []

  const base = migrateTaskV2toV3({
    ...raw,
    id,
    title,
    dueAt,
    startAt,
    endAt,
    createdAt,
    tags,
  })

  return {
    id,
    title,
    dueAt,
    startAt,
    endAt: base.endAt,
    allDay: base.allDay,
    rrule: base.rrule,
    seriesId: base.seriesId,
    recurrenceIndex: base.recurrenceIndex,
    skipped: base.skipped,
    tags,
    kind: typeof raw.kind === 'string' ? (raw.kind as StoredTask['kind']) : 'task',
    channel: asString(raw.channel),
    location: asString(raw.location),
    url: asString(raw.url),
    note: asString(raw.note),
    rawText: asString(raw.rawText) ?? '',
    confidence:
      raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low'
        ? raw.confidence
        : 'medium',
    reasons: Array.isArray(raw.reasons) ? raw.reasons.filter((item): item is string => typeof item === 'string') : [],
    engine:
      raw.engine === 'rule' || raw.engine === 'llm' || raw.engine === 'hybrid' || raw.engine === 'manual' || raw.engine === 'import'
        ? raw.engine
        : 'rule',
    createdAt,
    done: raw.done === true,
    editedFields: Array.isArray(raw.editedFields)
      ? raw.editedFields.filter((item): item is string => typeof item === 'string')
      : [],
    sourceUid: asString(raw.sourceUid),
  }
}

function normalizeSeries(raw: unknown, index: number, errors: string[]): TaskSeries | null {
  if (!isRecord(raw)) {
    errors.push(`第 ${index + 1} 条系列不是对象`)
    return null
  }
  const id = asString(raw.id)
  const rrule = asString(raw.rrule)
  const title = asString(raw.title)
  const startAt = typeof raw.startAt === 'number' && Number.isFinite(raw.startAt) ? raw.startAt : null
  if (!id || !rrule || !title || startAt === null) {
    errors.push(`第 ${index + 1} 条系列缺少 id/rrule/title/startAt`)
    return null
  }
  return {
    id,
    rrule,
    anchorDay: typeof raw.anchorDay === 'number' ? raw.anchorDay : null,
    anchorWeekday: typeof raw.anchorWeekday === 'number' ? raw.anchorWeekday : null,
    startAt,
    endAt: asNumberOrNull(raw.endAt),
    allDay: raw.allDay === true,
    title,
    kind: typeof raw.kind === 'string' ? (raw.kind as ParsedTask['kind']) : 'task',
    channel: asString(raw.channel),
    location: asString(raw.location),
    url: asString(raw.url),
    note: asString(raw.note),
    count: typeof raw.count === 'number' ? raw.count : null,
    until: asNumberOrNull(raw.until),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    endedAt: asNumberOrNull(raw.endedAt),
    tags: Array.isArray(raw.tags)
      ? raw.tags
          .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
          .map((tag) => tag.trim().replace(/^#+/, '').toLowerCase())
      : [],
  }
}

function normalizeBatch(raw: unknown, index: number, errors: string[]): ImportBatch | null {
  if (!isRecord(raw)) {
    errors.push(`第 ${index + 1} 条历史不是对象`)
    return null
  }
  const id = asString(raw.id)
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : null
  const rawText = asString(raw.rawText)
  if (!id || createdAt === null || rawText === null) {
    errors.push(`第 ${index + 1} 条历史缺少 id/createdAt/rawText`)
    return null
  }
  return {
    id,
    rawText,
    createdAt,
    taskCount: typeof raw.taskCount === 'number' ? raw.taskCount : 0,
    engine: raw.engine === 'llm' || raw.engine === 'hybrid' ? raw.engine : 'rule',
  }
}

/** 构造备份对象 */
export function buildBackup(input: BackupInput): ShisuiBackup {
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    appVersion: input.appVersion ?? '0.0.0',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date(input.now ?? Date.now()).toISOString(),
    tasks: input.tasks.map((task, index) => {
      const normalized = normalizeTask(task, index, [])
      return normalized as StoredTask
    }),
    series: input.series.map((item) => ({ ...item })),
    batches: input.batches.map((item) => ({ ...item })),
    settings: input.settings ?? {},
  }
}

/**
 * 校验并规范化一份备份（JSON 文本或已解析对象）。
 * 失败时 backup 为 null、errors 给出人话原因；**不改动任何现有数据**。
 */
export function validateBackup(raw: unknown): BackupValidation {
  const errors: string[] = []
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      const text = raw.trim()
      // 以 { 开头但括号未闭合：多半是下载/传输被截断，给专门提示
      const opens = (text.match(/[{\[]/g) ?? []).length
      const closes = (text.match(/[}\]]/g) ?? []).length
      if ((text.startsWith('{') || text.startsWith('[')) && opens > closes) {
        return {
          ok: false,
          errors: ['备份文件不完整（可能被截断），请重新导出后再恢复'],
          backup: null,
        }
      }
      return { ok: false, errors: ['不是合法的 JSON 文件'], backup: null }
    }
  }

  if (!isRecord(data)) {
    return { ok: false, errors: ['备份内容不是对象'], backup: null }
  }
  if (data.format !== BACKUP_FORMAT) {
    return { ok: false, errors: [`不是拾穗备份（format 应为 ${BACKUP_FORMAT}）`], backup: null }
  }
  // v2 时代的老备份没有 backupVersion：按旧格式接受，缺字段由迁移补默认
  const backupVersion = data.backupVersion ?? 0
  if (typeof backupVersion !== 'number' || !Number.isFinite(backupVersion)) {
    return { ok: false, errors: ['backupVersion 不合法'], backup: null }
  }
  if (backupVersion > BACKUP_VERSION) {
    return { ok: false, errors: [`备份格式过新（${backupVersion}），当前只支持 ${BACKUP_VERSION}`], backup: null }
  }
  if (typeof data.schemaVersion !== 'number' || !Number.isFinite(data.schemaVersion)) {
    return { ok: false, errors: ['缺少合法的 schemaVersion'], backup: null }
  }
  if (data.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return { ok: false, errors: [`备份数据版本过新（${data.schemaVersion}），当前只支持 ${BACKUP_SCHEMA_VERSION}`], backup: null }
  }
  if (!Array.isArray(data.tasks)) errors.push('缺少 tasks 数组')
  if (!Array.isArray(data.series)) errors.push('缺少 series 数组')
  if (!Array.isArray(data.batches)) errors.push('缺少 batches 数组')

  const tasks: StoredTask[] = []
  const series: TaskSeries[] = []
  const batches: ImportBatch[] = []

  if (Array.isArray(data.tasks)) {
    data.tasks.forEach((task, index) => {
      const normalized = normalizeTask(task, index, errors)
      if (normalized) tasks.push(normalized)
    })
  }
  if (Array.isArray(data.series)) {
    data.series.forEach((item, index) => {
      const normalized = normalizeSeries(item, index, errors)
      if (normalized) series.push(normalized)
    })
  }
  if (Array.isArray(data.batches)) {
    data.batches.forEach((item, index) => {
      const normalized = normalizeBatch(item, index, errors)
      if (normalized) batches.push(normalized)
    })
  }

  if (errors.length > 0) return { ok: false, errors, backup: null }

  const settings: BackupSettings = isRecord(data.settings) ? { ...(data.settings as BackupSettings) } : {}
  const exportedAt = asString(data.exportedAt) ?? new Date(0).toISOString()

  return {
    ok: true,
    errors: [],
    backup: {
      format: BACKUP_FORMAT,
      backupVersion: backupVersion,
      appVersion: asString(data.appVersion) ?? '0.0.0',
      schemaVersion: data.schemaVersion,
      exportedAt,
      tasks,
      series,
      batches,
      settings,
    },
  }
}
