/**
 * ICS（iCalendar）导入：把别的日历导出的 `.ics` 读回成待办。
 *
 * 设计取舍（都选最保守的一侧）：
 * - **零运行时依赖**：不引 ical.js；只处理 VEVENT 的必要字段。
 * - **时间**：支持 UTC（`...Z`）、floating（无时区，按本地时间理解）、`VALUE=DATE`（全天）、
 *   `TZID=...`（用 `Intl.DateTimeFormat` 反查该时区的 UTC 偏移，零依赖换算）。
 *   **不认识的 TZID → 跳过该事件并给 warning**，绝不"猜一个时区"。
 * - **RRULE**：v0.6 只导入首个实例，并在 warning 里说明，避免把重复规则误读成单次事件。
 * - **去重**：按 `UID` 匹配（见 `mergeIcsImport`），同 UID 再导入 → 更新而不是新增。
 */
import type { ParsedTask, TaskKind } from './types.js'
import { message, type LocalizedMessage } from './messages.js'
import { parseRRule } from './recurrence.js'

export interface IcsImportOptions {
  /** 生成 id 的函数；测试注入确定性实现 */
  makeId?: (index: number, uid: string | null) => string
}

export interface IcsImportResult {
  tasks: ParsedTask[]
  warnings: string[]
  warningCodes?: LocalizedMessage[]
  /** 解析失败 / 不支持而被跳过的事件数 */
  skipped: number
}

/** 去重合并的结果：纯数据，写库由调用方决定 */
export interface IcsMergePlan {
  toInsert: ParsedTask[]
  toUpdate: ParsedTask[]
  skipped: ParsedTask[]
}

interface Property {
  name: string
  params: Record<string, string>
  value: string
}

const DATE_RE = /^(\d{4})(\d{2})(\d{2})$/
const DATE_TIME_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/

/** 展开折行：以空格或制表符开头的行是上一行的续行（RFC 5545 §3.1） */
export function unfoldIcsLines(text: string): string[] {
  const raw = text.split(/\r\n|\r|\n/)
  const lines: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

/** ICS TEXT 反转义：\\n \\, \\; \\\\ */
export function unescapeIcsText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_match, ch: string) => {
    if (ch === 'n' || ch === 'N') return '\n'
    return ch
  })
}

function parseProperty(line: string): Property | null {
  const colon = line.indexOf(':')
  if (colon < 0) return null
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const segments = head.split(';')
  const name = segments[0].toUpperCase()
  const params: Record<string, string> = {}
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf('=')
    if (eq > 0) {
      params[segment.slice(0, eq).toUpperCase()] = segment.slice(eq + 1).replace(/^"|"$/g, '')
    }
  }
  return { name, params, value }
}

/** 用 Intl 求「某个时区在某时刻的 UTC 偏移」（毫秒）；非法时区返回 null */
function zoneOffsetMs(timeZone: string, ms: number): number | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = formatter.formatToParts(new Date(ms))
    const map: Record<string, string> = {}
    for (const part of parts) {
      if (part.type !== 'literal') map[part.type] = part.value
    }
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second),
    )
    if (Number.isNaN(asUtc)) return null
    return asUtc - ms
  } catch {
    return null
  }
}

/** 把「某时区里的墙上时间」换算成 UTC 瞬时（处理一轮 DST 边界偏差） */
export function zonedWallTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timeZone: string,
): number | null {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const first = zoneOffsetMs(timeZone, guess)
  if (first === null) return null
  const candidate = guess - first
  const second = zoneOffsetMs(timeZone, candidate)
  if (second === null) return null
  return second === first ? candidate : guess - second
}

interface ResolvedTime {
  ms: number
  allDay: boolean
}

/** 解析 DTSTART / DTEND；返回 null 表示无法解析（需要告警并跳过） */
export function resolveIcsTime(prop: Property): ResolvedTime | null {
  const value = prop.value.trim()
  const dateMatch = DATE_RE.exec(value)
  if (dateMatch || prop.params.VALUE === 'DATE') {
    const m = dateMatch ?? DATE_RE.exec(value)
    if (!m) return null
    return {
      ms: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime(),
      allDay: true,
    }
  }

  const dt = DATE_TIME_RE.exec(value)
  if (!dt) return null
  const [, y, mo, d, h, mi, s, zulu] = dt
  const yN = Number(y)
  const moN = Number(mo)
  const dN = Number(d)
  const hN = Number(h)
  const miN = Number(mi)
  const sN = Number(s)

  if (zulu === 'Z') {
    return { ms: Date.UTC(yN, moN - 1, dN, hN, miN, sN), allDay: false }
  }

  const timeZone = prop.params.TZID
  if (timeZone) {
    const ms = zonedWallTimeToUtc(yN, moN, dN, hN, miN, sN, timeZone)
    return ms === null ? null : { ms, allDay: false }
  }

  // floating：没有时区信息，按本地时间理解
  return { ms: new Date(yN, moN - 1, dN, hN, miN, sN).getTime(), allDay: false }
}

function kindFor(resolved: { start: ResolvedTime | null; end: ResolvedTime | null }): TaskKind {
  if (resolved.start?.allDay) return 'task'
  if (resolved.start && resolved.end) return 'meeting'
  return 'task'
}

/**
 * 无 UID 的事件 → 生成稳定的合成 UID（归一化 summary + start + end 的 FNV-1a 哈希）。
 * 目的：同一份文件重复导入不会翻倍。用纯函数保证跨运行、跨机器结果一致。
 */
export function syntheticIcsUid(summary: string, startAt: number | null, dueAt: number | null): string {
  const normalized = [summary.trim().toLowerCase(), startAt ?? '', dueAt ?? ''].join('|')
  let hash = 0x811c9dc5
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `syn-${hash.toString(16).padStart(8, '0')}`
}

interface RawEvent {
  uid: string | null
  summary: string
  description: string
  location: string
  url: string
  start: Property | null
  end: Property | null
  hasRule: boolean
  /** 原始 RRULE 值（未带 RRULE: 前缀） */
  rruleValue: string | null
}

function collectEvents(lines: string[]): RawEvent[] {
  const events: RawEvent[] = []
  let current: RawEvent | null = null
  /** 1 = 在 VEVENT 里；>1 = 在嵌套块（VALARM / VTIMEZONE 等）里 */
  let depth = 0

  for (const line of lines) {
    const prop = parseProperty(line)
    if (!prop) continue
    const name = prop.name
    const value = prop.value.trim().toUpperCase()

    if (name === 'BEGIN') {
      if (value === 'VEVENT') {
        current = {
        uid: null,
        summary: '',
        description: '',
        location: '',
        url: '',
        start: null,
        end: null,
        hasRule: false,
        rruleValue: null,
      }
        depth = 1
      } else if (current) {
        depth += 1
      }
      continue
    }
    if (name === 'END') {
      if (value === 'VEVENT') {
        if (current) events.push(current)
        current = null
        depth = 0
      } else if (current && depth > 1) {
        depth -= 1
      }
      continue
    }
    if (!current || depth > 1) continue

    switch (name) {
      case 'UID':
        current.uid = unescapeIcsText(prop.value.trim()) || null
        break
      case 'SUMMARY':
        current.summary = unescapeIcsText(prop.value)
        break
      case 'DESCRIPTION':
        current.description = unescapeIcsText(prop.value)
        break
      case 'LOCATION':
        current.location = unescapeIcsText(prop.value)
        break
      case 'URL':
        current.url = prop.value.trim()
        break
      case 'DTSTART':
        current.start = prop
        break
      case 'DTEND':
        current.end = prop
        break
      case 'RRULE':
        current.hasRule = true
        current.rruleValue = prop.value.trim()
        break
      default:
        break
    }
  }
  return events
}

/**
 * 解析 ICS 文本。永远不抛异常：坏文件返回空结果 + warning，UI 据此给出可读错误。
 */
export function importIcs(text: string, options: IcsImportOptions = {}): IcsImportResult {
  const warnings: string[] = []
  const warningCodes: LocalizedMessage[] = []
  const tasks: ParsedTask[] = []
  let skipped = 0

  if (!text || !/BEGIN:VCALENDAR/i.test(text)) {
    return {
      tasks: [],
      warnings: ['这不是一个 iCalendar 文件（缺少 BEGIN:VCALENDAR）'],
      warningCodes: [message('ics.notCalendar')],
      skipped: 0,
    }
  }
  if (/BEGIN:VEVENT/i.test(text) && !/END:VEVENT/i.test(text)) {
    return {
      tasks: [],
      warnings: ['文件不完整：有 BEGIN:VEVENT 却没有 END:VEVENT，可能被截断了'],
      warningCodes: [message('ics.incomplete')],
      skipped: 1,
    }
  }

  const events = collectEvents(unfoldIcsLines(text))
  const makeId = options.makeId ?? ((index: number, uid: string | null) => `ics_${index}_${uid ?? 'noid'}`)

  events.forEach((event, index) => {
    const label = event.summary || event.uid || `第 ${index + 1} 个事件`

    const start = event.start ? resolveIcsTime(event.start) : null
    const end = event.end ? resolveIcsTime(event.end) : null

    if (event.start && start === null) {
      skipped += 1
      const tz = event.start.params.TZID
      warnings.push(
        tz
          ? `「${label}」的时区 ${tz} 无法识别，已跳过（不会猜时区）`
          : `「${label}」的时间格式无法解析（${event.start.value}），已跳过`,
      )
      warningCodes.push(
        tz
          ? message('ics.badTimezone', { label, tz })
          : message('ics.badStart', { label, value: event.start.value }),
      )
      return
    }
    if (event.end && end === null) {
      warnings.push(`「${label}」的结束时间无法解析，已忽略结束时间`)
      warningCodes.push(message('ics.badEnd', { label }))
    }
    if (!start && !end) {
      skipped += 1
      warnings.push(`「${label}」没有开始时间，已跳过`)
      warningCodes.push(message('ics.noStart', { label }))
      return
    }

    const title = event.summary.trim() || '未命名事件'
    const allDay = start?.allDay === true
    const startMs = start?.ms ?? end?.ms ?? null
    if (startMs === null) {
      skipped += 1
      warnings.push(`「${label}」没有可用时间，已跳过`)
      warningCodes.push(message('ics.noTime', { label }))
      return
    }

    // 区间：DTEND 是 exclusive；单日全天没有 DTEND 时 endAt=null（隐含 +1 天）
    let endAt: number | null = null
    if (end) {
      if (allDay) {
        endAt = end.ms > startMs ? end.ms : null
      } else {
        endAt = end.ms > startMs ? end.ms : null
      }
    }
    if (!allDay && start && !end) {
      // 与导出对称：无 DTEND 的定时事件默认 30 分钟
      endAt = startMs + 30 * 60 * 1000
    }

    let rrule: string | null = null
    if (event.rruleValue) {
      const parsed = parseRRule(event.rruleValue)
      if (parsed) {
        rrule = event.rruleValue
      } else {
        warnings.push(`「${label}」的重复规则不受支持（${event.rruleValue}），已按单次事件导入`)
        warningCodes.push(message('ics.unsupportedRrule', { label, rrule: event.rruleValue }))
      }
    }

    const reasons = ['从日历文件按标准字段导入']
    const reasonCodes = [message('reason.icsImport')]
    if (rrule) {
      reasons.push(`重复规则：${rrule}`)
      reasonCodes.push(message('reason.recurrence', { rule: rrule }))
    }
    if (allDay) {
      reasons.push('全天事件')
      reasonCodes.push(message('reason.allDay'))
    }

    const rawLines = [`[ICS 导入] ${title}`]
    if (event.description.trim()) rawLines.push(event.description.trim())
    if (event.uid) rawLines.push(`UID: ${event.uid}`)

    const sourceUid = event.uid ?? syntheticIcsUid(title, startMs, endAt)

    tasks.push({
      id: makeId(index, event.uid),
      title,
      dueAt: null,
      startAt: startMs,
      endAt,
      allDay,
      rrule,
      kind: kindFor({ start, end }),
      channel: null,
      location: event.location.trim() || null,
      url: /^https?:\/\//i.test(event.url) ? event.url : null,
      note: event.description.trim() || null,
      rawText: rawLines.join('\n'),
      confidence: 'high',
      reasons,
      engine: 'import',
      sourceUid,
    })
  })

  return { tasks, warnings, warningCodes, skipped }
}

/** 按 sourceUid 去重：同 UID 已存在 → 覆盖更新；不存在的 → 新增；无 UID（理论上不会出现）→ 新增 */
export function mergeIcsImport(
  existing: readonly { id: string; sourceUid?: string | null }[],
  parsed: readonly ParsedTask[],
): IcsMergePlan {
  const byUid = new Map<string, { id: string }>()
  for (const task of existing) {
    if (task.sourceUid) byUid.set(task.sourceUid, task)
  }

  const toInsert: ParsedTask[] = []
  const toUpdate: ParsedTask[] = []
  const skipped: ParsedTask[] = []
  const seenInFile = new Set<string>()

  for (const task of parsed) {
    const uid = task.sourceUid ?? null
    if (!uid) {
      toInsert.push(task)
      continue
    }
    if (seenInFile.has(uid)) {
      // 同一个文件里出现两次同样的 UID：只保留第一条
      skipped.push(task)
      continue
    }
    seenInFile.add(uid)

    const existingTask = byUid.get(uid)
    if (existingTask) {
      toUpdate.push({ ...task, id: existingTask.id })
    } else {
      toInsert.push(task)
    }
  }

  return { toInsert, toUpdate, skipped }
}
