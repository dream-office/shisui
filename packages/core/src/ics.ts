/**
 * ICS（iCalendar）导出：把日程导出成能被系统日历 / Google Calendar / Outlook 订阅的文件。
 *
 * 设计取舍（都选了最保守的一侧）：
 * - **所有时间转成 UTC（`...Z`）**，不写 `TZID` + `VTIMEZONE`。
 *   原因：`TZID` 需要在文件里自带时区定义，各客户端对 Windows 时区名的支持不一致；
 *   UTC 是绝对时刻，任何日历都能正确换算成本地时间。
 * - **全天事件**：只把「本地时间恰好 00:00:00」的任务视为全天（`VALUE=DATE`），
 *   其余一律按带时刻的事件导出。规则单一、可预测，不用猜用户意图。
 * - **折行**：按 75 字节（不是字符）折行 —— 中文一个字 3 字节，按字符折会超长。
 * - 零运行时依赖：纯字符串拼接，可在任何 JS 环境跑。
 */
import type { ParsedTask } from './types.js'

/** 导出所需的最小字段集合（StoredTask 也满足它） */
export interface IcsTask {
  id: string
  title: string
  dueAt: number | null
  startAt?: number | null
  channel?: string | null
  location?: string | null
  rawText?: string
  done?: boolean
}

export interface IcsOptions {
  /** DTSTAMP 用的「现在」；测试注入固定值以获得确定性 */
  ref?: Date
  /** 是否包含已完成的任务（默认不放，日历里只看还要做的） */
  includeDone?: boolean
  /** 日历名（部分客户端会显示） */
  calendarName?: string
}

const PRODID = '-//dream-office//shisui//ZH'
/** 带时刻的任务默认时长：只给了截止时间的任务按 30 分钟排 */
const DEFAULT_DURATION_MS = 30 * 60 * 1000
const MAX_LINE_OCTETS = 75

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function toUtc(ms: number): string {
  const d = new Date(ms)
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  )
}

function toDateOnly(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

/** 加一天后的日期（全天事件的 DTEND 是「不含」的次日） */
function addOneDayDateOnly(ms: number): string {
  const d = new Date(ms)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

/** 本地时间恰好 00:00:00 才是全天 */
export function isAllDayTimestamp(ms: number): boolean {
  const d = new Date(ms)
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
}

/** ICS TEXT 转义：反斜杠、分号、逗号、换行 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** 按 75 字节折行（续行以单个空格开头，属于 ICS 规范要求） */
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  const chunks: string[] = []
  let current = ''
  let octets = 0

  for (const char of line) {
    const size = encoder.encode(char).length
    if (octets + size > MAX_LINE_OCTETS) {
      chunks.push(current)
      current = ' '
      octets = 1
    }
    current += char
    octets += size
  }
  chunks.push(current)
  return chunks.join('\r\n')
}

function lines(...items: string[]): string {
  return items.filter(Boolean).map(foldLine).join('\r\n')
}

function describe(task: IcsTask): string {
  const parts: string[] = []
  if (task.channel) parts.push(`渠道：${task.channel}`)
  if (task.location) parts.push(`地点：${task.location}`)
  if (task.rawText) parts.push(`原文：${task.rawText}`)
  return parts.join('\n')
}

function buildEvent(task: IcsTask, dtstamp: string): string | null {
  const start = task.startAt ?? task.dueAt
  if (start === null || start === undefined) return null

  const allDay = isAllDayTimestamp(start)
  let dtstart: string
  let dtend: string

  if (allDay) {
    dtstart = `DTSTART;VALUE=DATE:${toDateOnly(start)}`
    dtend = `DTEND;VALUE=DATE:${addOneDayDateOnly(start)}`
  } else {
    const endMs =
      task.startAt !== null && task.startAt !== undefined && task.dueAt !== null && task.dueAt !== undefined && task.dueAt > task.startAt
        ? task.dueAt
        : start + DEFAULT_DURATION_MS
    dtstart = `DTSTART:${toUtc(start)}`
    dtend = `DTEND:${toUtc(endMs)}`
  }

  const description = describe(task)
  const body = [
    'BEGIN:VEVENT',
    lines(`UID:${escapeIcsText(task.id)}@shisui`),
    `DTSTAMP:${dtstamp}`,
    dtstart,
    dtend,
    lines(`SUMMARY:${escapeIcsText(task.title || '未命名')}`),
    description ? lines(`DESCRIPTION:${escapeIcsText(description)}`) : '',
    task.location ? lines(`LOCATION:${escapeIcsText(task.location)}`) : '',
    task.done ? 'STATUS:COMPLETED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
  ]
    .filter(Boolean)
    .join('\r\n')

  return body
}

/**
 * 待办列表 → ICS 文本。
 * 没有时间信息的任务会被跳过（日历里没法放），已完成默认跳过。
 */
export function tasksToIcs(tasks: readonly IcsTask[], options: IcsOptions = {}): string {
  const ref = options.ref ?? new Date()
  const dtstamp = toUtc(ref.getTime())

  const exported = tasks
    .filter((task) => (task.startAt ?? task.dueAt) !== null && (task.startAt ?? task.dueAt) !== undefined)
    .filter((task) => options.includeDone === true || task.done !== true)
    .slice()
    .sort((a, b) => (a.startAt ?? a.dueAt ?? 0) - (b.startAt ?? b.dueAt ?? 0))

  const events = exported
    .map((task) => buildEvent(task, dtstamp))
    .filter((event): event is string => event !== null)

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    lines(`X-WR-CALNAME:${escapeIcsText(options.calendarName ?? '拾穗日程')}`),
  ].join('\r\n')

  return `${header}\r\n${events.length > 0 ? events.join('\r\n') + '\r\n' : ''}END:VCALENDAR\r\n`
}

/** 便于测试与 UI：把 ParsedTask 映射成 IcsTask（结构兼容，这里只做类型收敛） */
export function toIcsTask(task: ParsedTask & { done?: boolean }): IcsTask {
  return {
    id: task.id,
    title: task.title,
    dueAt: task.dueAt,
    startAt: task.startAt,
    channel: task.channel,
    location: task.location,
    rawText: task.rawText,
    done: task.done,
  }
}
