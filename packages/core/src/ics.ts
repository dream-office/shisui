/**
 * ICS（iCalendar）导出：把日程导出成能被系统日历 / Google Calendar / Outlook 订阅的文件。
 *
 * 设计取舍（都选了最保守的一侧）：
 * - **所有时间转成 UTC（`...Z`）**，不写 `TZID` + `VTIMEZONE`。
 *   原因：`TZID` 需要在文件里自带时区定义，各客户端对 Windows 时区名的支持不一致；
 *   UTC 是绝对时刻，任何日历都能正确换算成本地时间。
 * - **全天事件**：`allDay: true` 或开始时刻恰好本地 00:00:00；导出 `VALUE=DATE`。
 * - **区间**：`endAt` 是 **exclusive**，与 ICS `DTEND` 语义一致，直接照搬。
 * - **重复任务**：一个系列**只导出一次 RRULE 主事件**（实例不重复导出），
 *   结束系列用 `UNTIL` 截断。
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
  endAt?: number | null
  allDay?: boolean
  seriesId?: string | null
  rrule?: string | null
  channel?: string | null
  location?: string | null
  rawText?: string
  done?: boolean
}

/** 系列主事件：一个系列只导出一次 */
export interface IcsSeries {
  id: string
  rrule: string
  startAt: number
  endAt?: number | null
  allDay?: boolean
  title: string
  channel?: string | null
  location?: string | null
  until?: number | null
  endedAt?: number | null
}

export interface IcsOptions {
  /** DTSTAMP 用的「现在」；测试注入固定值以获得确定性 */
  ref?: Date
  /** 是否包含已完成的任务（默认不放，日历里只看还要做的） */
  includeDone?: boolean
  /** 日历名（部分客户端会显示） */
  calendarName?: string
  /** 重复系列：每个系列导出一个带 RRULE 的主事件 */
  series?: readonly IcsSeries[]
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

/** 一个码点的 UTF-8 字节数（纯数学，不依赖 TextEncoder，任何环境结果一致） */
function utf8Length(char: string): number {
  const code = char.codePointAt(0) ?? 0
  if (code <= 0x7f) return 1
  if (code <= 0x7ff) return 2
  if (code <= 0xffff) return 3
  return 4
}

/** 按 75 字节折行（续行以单个空格开头，属于 ICS 规范要求） */
function foldLine(line: string): string {
  const chunks: string[] = []
  let current = ''
  let octets = 0

  for (const char of line) {
    const size = utf8Length(char)
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

interface EventInput {
  uid: string
  title: string
  start: number
  end: number
  allDay: boolean
  location?: string | null
  description?: string
  rrule?: string | null
  done?: boolean
  /** 结束系列的时刻：附加/收紧 UNTIL */
  until?: number | null
}

function buildEvent(input: EventInput, dtstamp: string): string {
  const { start, end, allDay } = input
  const dtstart = allDay ? `DTSTART;VALUE=DATE:${toDateOnly(start)}` : `DTSTART:${toUtc(start)}`
  const dtend = allDay ? `DTEND;VALUE=DATE:${toDateOnly(end)}` : `DTEND:${toUtc(end)}`

  return [
    'BEGIN:VEVENT',
    lines(`UID:${escapeIcsText(input.uid)}@shisui`),
    `DTSTAMP:${dtstamp}`,
    dtstart,
    dtend,
    lines(`SUMMARY:${escapeIcsText(input.title || '未命名')}`),
    input.description ? lines(`DESCRIPTION:${escapeIcsText(input.description)}`) : '',
    input.location ? lines(`LOCATION:${escapeIcsText(input.location)}`) : '',
    input.rrule ? foldLine(`RRULE:${applyUntil(input.rrule, input.until)}`) : '',
    input.done ? 'STATUS:COMPLETED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
  ]
    .filter(Boolean)
    .join('\r\n')
}

/** 把结束系列时刻作为 UNTIL 附加到 RRULE 上（已有更早的 UNTIL 则保留更早的） */
function applyUntil(rrule: string, until?: number | null): string {
  if (until === null || until === undefined) return rrule
  const d = new Date(until)
  const stamp =
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`

  if (/UNTIL=([0-9TZ]+)/i.test(rrule)) {
    const existing = /UNTIL=([0-9TZ]+)/i.exec(rrule)![1]
    return existing < stamp ? rrule : rrule.replace(/UNTIL=[0-9TZ]+/i, `UNTIL=${stamp}`)
  }
  return `${rrule};UNTIL=${stamp}`
}

/** 事件结束时刻：endAt 优先；legacy dueAt（大于开始）兼容；全天 +1 天；定时默认 30 分钟 */
function resolveEnd(input: {
  start: number
  endAt?: number | null
  dueAt?: number | null
  allDay: boolean
}): number {
  if (input.endAt !== null && input.endAt !== undefined && input.endAt > input.start) return input.endAt
  if (input.allDay) {
    const d = new Date(input.start)
    d.setDate(d.getDate() + 1)
    return d.getTime()
  }
  if (input.dueAt !== null && input.dueAt !== undefined && input.dueAt > input.start) return input.dueAt
  return input.start + DEFAULT_DURATION_MS
}

/**
 * 待办列表 → ICS 文本。
 * - 没有时间信息的任务跳过（日历里没法放），已完成默认跳过
 * - 重复实例（有 seriesId）不单独导出，由 options.series 统一导出一次 RRULE 主事件
 */
export function tasksToIcs(tasks: readonly IcsTask[], options: IcsOptions = {}): string {
  const ref = options.ref ?? new Date()
  const dtstamp = toUtc(ref.getTime())
  const seriesIds = new Set((options.series ?? []).map((item) => item.id))

  const singles = tasks
    .filter((task) => !task.seriesId || !seriesIds.has(task.seriesId))
    .filter((task) => (task.startAt ?? task.dueAt) !== null && (task.startAt ?? task.dueAt) !== undefined)
    .filter((task) => options.includeDone === true || task.done !== true)
    .filter((task) => !task.seriesId || !task.rrule) // 实例不导出 RRULE
    .slice()
    .sort((a, b) => (a.startAt ?? a.dueAt ?? 0) - (b.startAt ?? b.dueAt ?? 0))

  const events = singles.map((task) => {
    const start = (task.startAt ?? task.dueAt)!
    const allDay = task.allDay === true || isAllDayTimestamp(start)
    const end = resolveEnd({ start, endAt: task.endAt, dueAt: task.dueAt, allDay })
    return buildEvent(
      {
        uid: task.id,
        title: task.title,
        start,
        end,
        allDay,
        location: task.location,
        description: [task.channel ? `渠道：${task.channel}` : '', task.rawText ? `原文：${task.rawText}` : '']
          .filter(Boolean)
          .join('\n'),
        rrule: task.rrule ?? null,
        done: task.done,
      },
      dtstamp,
    )
  })

  for (const series of options.series ?? []) {
    const allDay = series.allDay === true || isAllDayTimestamp(series.startAt)
    const end =
      series.endAt !== null && series.endAt !== undefined && series.endAt > series.startAt
        ? series.endAt
        : resolveEnd({ start: series.startAt, allDay })
    events.push(
      buildEvent(
        {
          uid: series.id,
          title: series.title,
          start: series.startAt,
          end,
          allDay,
          location: series.location,
          description: series.channel ? `渠道：${series.channel}` : '',
          rrule: series.rrule,
          until: series.endedAt ?? series.until ?? null,
        },
        dtstamp,
      ),
    )
  }

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
    endAt: task.endAt ?? null,
    allDay: task.allDay ?? false,
    seriesId: task.seriesId ?? null,
    rrule: task.rrule ?? null,
    channel: task.channel,
    location: task.location,
    rawText: task.rawText,
    done: task.done,
  }
}
