/**
 * 手动添加：不经过解析引擎，由用户直接构造一条待办。
 * 纯函数，放在 core 里，测试不需要 DOM/存储。
 */
import type { ParsedTask, TaskKind } from './types.js'
import { message } from './messages.js'

export type ManualErrorCode = 'manual.emptyTitle' | 'manual.noTime'

export class ManualTaskError extends Error {
  code: ManualErrorCode
  constructor(code: ManualErrorCode, message: string) {
    super(message)
    this.name = 'ManualTaskError'
    this.code = code
  }
}

export interface ManualTaskInput {
  /** 标题，必填 */
  title: string
  /** 截止时间（epoch ms）；与 startAt 至少要有一个 */
  dueAt?: number | null
  /** 开始时间（会议/考试这类） */
  startAt?: number | null
  kind?: TaskKind
  channel?: string | null
  location?: string | null
  /** 备注：会原样保留在 rawText 里，方便以后核对 */
  notes?: string
}

/** 生成一条手动添加的待办。id 由调用方提供，便于测试注入。 */
export function createManualTask(input: ManualTaskInput, id: string): ParsedTask {
  const title = input.title.trim()
  if (!title) {
    throw new ManualTaskError('manual.emptyTitle', '标题不能为空')
  }
  const dueAt = input.dueAt ?? null
  const startAt = input.startAt ?? null
  if (dueAt === null && startAt === null) {
    throw new ManualTaskError('manual.noTime', '至少填一个时间：截止时间或开始时间')
  }

  const notes = input.notes?.trim()
  return {
    id,
    title,
    dueAt,
    startAt,
    kind: input.kind ?? 'task',
    channel: input.channel?.trim() || null,
    location: input.location?.trim() || null,
    rawText: notes ? `[手动添加] ${notes}` : `[手动添加] ${title}`,
    confidence: 'high',
    reasons: ['手动添加：由你直接填写，规则引擎没有参与判断'],
    reasonCodes: [message('reason.manual')],
    engine: 'manual',
  }
}
