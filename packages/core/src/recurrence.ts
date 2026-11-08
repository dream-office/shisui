/**
 * 重复规则：中文输入 ↔ 规范化 RRULE 子集 ↔ 下一次出现。
 *
 * 子集（与测试员清单一致）：
 *   FREQ=DAILY | WEEKLY | MONTHLY，INTERVAL，BYDAY（仅 WEEKLY），
 *   COUNT（含首次），UNTIL（含当天）。
 *
 * 关键决策：
 * - **月末锚定**：每月 31 号在 2 月落到 28/29 后，3 月要回到 31 —— 所以存 `anchorDay`（原始日），
 *   每次从锚点算，而不是从上一次实例的日期算。
 * - **本地日历算术**：用 `setDate`/`new Date(y,m,d,...)` 推进，不用 `+86400000ms`，
 *   否则 DST 切换周会漂 1 小时。
 * - 单步生成：`nextOccurrence` 只算「下一次」，绝不展开成 N 条（防止无限循环）。
 */

export type RecurFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY'

export interface RecurRule {
  freq: RecurFrequency
  /** 间隔倍数，>= 1 */
  interval: number
  /** WEEKLY：星期集合（1=周一 … 7=周日） */
  byDay?: number[]
  /** WEEKLY：系列锚定的星期（默认取首次实例的星期） */
  anchorWeekday?: number
  /** MONTHLY：锚定日（1-31），短月 clamp 到月末，下个月回到锚定日 */
  anchorDay?: number
  /** 总实例数（含首次），null = 不限 */
  count?: number | null
  /** 结束时间（epoch ms，含当天），null = 不限 */
  until?: number | null
}

const WEEKDAY_CN: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
}

const WEEKDAY_EN: Record<string, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
}

const CN_NUM: Record<string, number> = {
  零: 0,
  一: 1,
  两: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

function cnNumber(input: string): number | null {
  if (/^\d+$/.test(input)) return Number(input)
  if (input === '十') return 10
  if (input.startsWith('十') && input.length === 2) return 10 + (CN_NUM[input[1]] ?? 0)
  if (input.length === 2 && input[1] === '十') return (CN_NUM[input[0]] ?? 0) * 10
  if (input.endsWith('十') && input.length === 2) return (CN_NUM[input[0]] ?? 0) * 10
  if (input.length === 2 && input[0] === '十') return 10 + (CN_NUM[input[1]] ?? 0)
  if (input.length === 1) return CN_NUM[input] ?? null
  return null
}

const NUM = '(\\d{1,2}|[一二两三四五六七八九十]{1,3})'

/** 中文重复说法 → 规则；不认识的返回 null */
export function parseRecurrenceInput(text: string): RecurRule | null {
  const source = text.trim()
  if (!source) return null

  // 先把次数/截止摘出来（它们可以出现在任意位置）
  let rest = source
  let count: number | null = null
  let until: number | null = null

  const countMatch = new RegExp(`共\\s*${NUM}\\s*次`).exec(rest)
  if (countMatch) {
    const n = cnNumber(countMatch[1])
    if (n && n > 0) count = n
    rest = rest.replace(countMatch[0], '')
  }

  const untilMatch = /(?:到|截止|至)\s*(\d{4})?[-/年]?\s*(\d{1,2})[-/月]\s*(\d{1,2})\s*[日号]?/.exec(rest)
  if (untilMatch) {
    const year = untilMatch[1] ? Number(untilMatch[1]) : new Date().getFullYear()
    const month = Number(untilMatch[2])
    const day = Number(untilMatch[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      until = new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
      rest = rest.replace(untilMatch[0], '')
    }
  }

  // 每月 N 号 / 每月 N 日（可带「每2个月」）
  const monthly = new RegExp(`每\\s*(?:隔\\s*)?${NUM}?\\s*个?\\s*月(?:的)?\\s*${NUM}\\s*[号日]`).exec(rest)
  if (monthly) {
    const interval = monthly[1] ? cnNumber(monthly[1]) : 1
    const day = cnNumber(monthly[2])
    if (day && day >= 1 && day <= 31) {
      return { freq: 'MONTHLY', interval: interval && interval > 0 ? interval : 1, anchorDay: day, count, until }
    }
  }

  // 每周 / 每两周的周X（可能多个）
  const weekly = new RegExp(`每\\s*(?:隔\\s*)?${NUM}?\\s*个?\\s*周`).exec(rest)
  if (weekly) {
    const interval = weekly[1] ? cnNumber(weekly[1]) : 1
    const tail = rest.slice(weekly.index + weekly[0].length)
    const days: number[] = []
    for (const match of tail.matchAll(/(?:周|星期|礼拜)([一二三四五六日天])/g)) {
      const wd = WEEKDAY_CN[match[1]]
      if (wd && !days.includes(wd)) days.push(wd)
    }
    if (days.length === 0) {
      const single = /(?:周|星期|礼拜)([一二三四五六日天])/.exec(rest)
      if (single) days.push(WEEKDAY_CN[single[1]])
    }
    if (days.length > 0) {
      return {
        freq: 'WEEKLY',
        interval: interval && interval > 0 ? interval : 1,
        byDay: days.sort((a, b) => a - b),
        anchorWeekday: days[0],
        count,
        until,
      }
    }
  }

  // 每 N 天 / 每天
  const daily = new RegExp(`每\\s*(?:隔\\s*)?${NUM}?\\s*天`).exec(rest)
  if (daily || /每[日天]/.test(rest)) {
    const interval = daily?.[1] ? cnNumber(daily[1]) : 1
    return { freq: 'DAILY', interval: interval && interval > 0 ? interval : 1, count, until }
  }

  return null
}

/** 中文说法是否像「重复」 */
export function looksRecurring(text: string): boolean {
  return /每\s*(?:隔\s*)?(?:\d+|[一二两三四五六七八九十])?\s*(?:天|日|周|星期|礼拜|个?月)/.test(text)
}

/** 规则 → 用户可读描述（UI 徽标/预览用） */
export function describeRule(rule: RecurRule): string {
  if (rule.freq === 'DAILY') {
    return rule.interval === 1 ? '每天' : `每隔 ${rule.interval} 天`
  }
  if (rule.freq === 'WEEKLY') {
    const names = (rule.byDay ?? []).map((d) => '周' + ['一', '二', '三', '四', '五', '六', '日'][d - 1]).join('、')
    const prefix = rule.interval === 1 ? '每周' : `每 ${rule.interval} 周`
    return `${prefix}${names}`
  }
  const base = rule.interval === 1 ? '每月' : `每 ${rule.interval} 个月`
  return `${base} ${rule.anchorDay ?? 1} 号`
}

/** 规则 → 规范化 RRULE（不带 `RRULE:` 前缀） */
export function ruleToRRule(rule: RecurRule): string {
  const parts = [`FREQ=${rule.freq}`]
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.freq === 'WEEKLY' && rule.byDay && rule.byDay.length > 0) {
    const map = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
    parts.push(`BYDAY=${rule.byDay.map((d) => map[d - 1]).join(',')}`)
  }
  if (rule.freq === 'MONTHLY' && rule.anchorDay) parts.push(`BYMONTHDAY=${rule.anchorDay}`)
  if (rule.count) parts.push(`COUNT=${rule.count}`)
  if (rule.until) parts.push(`UNTIL=${formatUtcCompact(rule.until)}`)
  return parts.join(';')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatUtcCompact(ms: number): string {
  const d = new Date(ms)
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  )
}

/** ICS RRULE 值 → 规则；不支持的写法返回 null（调用方告警降级） */
export function parseRRule(rrule: string): RecurRule | null {
  const value = rrule.replace(/^RRULE:/i, '').trim()
  const fields = new Map<string, string>()
  for (const part of value.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0) fields.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1))
  }

  // 子集之外的关键字一律拒绝（BYSETPOS/BYMONTH/BYWEEKNO/EXDATE…），避免"看起来支持其实算错"
  const allowed = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'COUNT', 'UNTIL'])
  for (const key of fields.keys()) {
    if (!allowed.has(key)) return null
  }

  const freq = (fields.get('FREQ') ?? '').toUpperCase()
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null

  const interval = Number(fields.get('INTERVAL') ?? 1)
  if (!Number.isFinite(interval) || interval < 1) return null

  const byDayRaw = fields.get('BYDAY')
  const byMonthDayRaw = fields.get('BYMONTHDAY')
  const countRaw = fields.get('COUNT')
  const untilRaw = fields.get('UNTIL')

  const rule: RecurRule = {
    freq,
    interval: Math.floor(interval),
    count: countRaw ? Number(countRaw) : null,
    until: untilRaw ? parseUntil(untilRaw) : null,
  }

  if (byDayRaw) {
    if (freq !== 'WEEKLY') return null // 子集：BYDAY 只支持 WEEKLY
    const days = byDayRaw
      .split(',')
      .map((token) => WEEKDAY_EN[token.trim().toUpperCase()])
      .filter((d): d is number => typeof d === 'number')
    if (days.length === 0) return null
    rule.byDay = [...new Set(days)].sort((a, b) => a - b)
    rule.anchorWeekday = rule.byDay[0]
  }

  if (byMonthDayRaw) {
    if (freq !== 'MONTHLY') return null
    const day = Number(byMonthDayRaw)
    if (!Number.isFinite(day) || day < 1 || day > 31) return null
    rule.anchorDay = day
  }

  if (freq === 'MONTHLY' && !rule.anchorDay) rule.anchorDay = 1

  if (rule.count !== null && rule.count !== undefined && (!Number.isFinite(rule.count) || rule.count < 1)) return null
  if (rule.until !== null && rule.until !== undefined && !Number.isFinite(rule.until)) return null

  return rule
}

/** UNTIL：支持 `20261231T235959Z` / `20261231` / `2026-12-31` */
function parseUntil(raw: string): number | null {
  const compact = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(raw.trim())
  if (compact) {
    const [, y, mo, d, h, mi, s] = compact
    if (h !== undefined) {
      return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
    }
    return new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59, 999).getTime()
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 23, 59, 59, 999).getTime()
  return null
}

/** 某月天数（本地日历） */
export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

function nextWeekly(rule: RecurRule, current: Date): Date {
  const interval = rule.interval || 1
  const byDay = rule.byDay && rule.byDay.length > 0 ? rule.byDay : [((current.getDay() + 6) % 7) + 1]
  const currentWeekMonday = new Date(current.getFullYear(), current.getMonth(), current.getDate())
  currentWeekMonday.setDate(currentWeekMonday.getDate() - ((currentWeekMonday.getDay() + 6) % 7))

  const candidate = new Date(current)
  for (;;) {
    candidate.setDate(candidate.getDate() + 1)
    const weekday = ((candidate.getDay() + 6) % 7) + 1
    if (!byDay.includes(weekday)) continue
    const candidateMonday = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate())
    candidateMonday.setDate(candidateMonday.getDate() - ((candidateMonday.getDay() + 6) % 7))
    const weekDiff = Math.round((candidateMonday.getTime() - currentWeekMonday.getTime()) / (7 * 86_400_000))
    if (weekDiff % interval === 0) return candidate
  }
}

/** 基于当前实例算下一次；返回 null 表示系列结束（COUNT/UNTIL 用尽） */
export function nextOccurrence(rule: RecurRule, currentStartMs: number, currentIndex: number): number | null {
  const nextIndex = currentIndex + 1
  const totalCount = rule.count ?? null
  const until = rule.until ?? null
  // COUNT 含首次：实例总数 = count；下一个序号 >= count 就不再生成
  if (totalCount !== null && nextIndex >= totalCount) return null

  const current = new Date(currentStartMs)
  let next: Date

  if (rule.freq === 'DAILY') {
    next = new Date(current)
    next.setDate(next.getDate() + (rule.interval || 1))
  } else if (rule.freq === 'WEEKLY') {
    next = nextWeekly(rule, current)
  } else {
    const anchor = rule.anchorDay ?? current.getDate()
    const monthsToAdd = rule.interval || 1
    const nextMonth0 = current.getMonth() + monthsToAdd
    const year = current.getFullYear() + Math.floor(nextMonth0 / 12)
    const month0 = ((nextMonth0 % 12) + 12) % 12
    const day = Math.min(anchor, daysInMonth(year, month0))
    next = new Date(year, month0, day, current.getHours(), current.getMinutes(), current.getSeconds(), current.getMilliseconds())
  }

  if (until !== null && next.getTime() > until) return null
  return next.getTime()
}


export interface NextInstanceInput {
  id: string
  title: string
  kind: string
  channel?: string | null
  location?: string | null
  rawText?: string
  startAt?: number | null
  dueAt?: number | null
  endAt?: number | null
  allDay?: boolean
  seriesId: string
  recurrenceIndex: number
}

/**
 * 用系列规则 + 当前实例，算出「下一条待办」。
 * 返回 null 表示系列已结束（COUNT/UNTIL 用尽）。
 * 区间实例保持时长；全天保持整天。
 */
export function buildNextInstance<T extends NextInstanceInput>(
  current: T,
  rule: RecurRule,
  options: { nextId: string; seriesEnded?: boolean },
): (T & { id: string; recurrenceIndex: number; seriesId: string; done: false }) | null {
  if (options.seriesEnded) return null
  const primary = current.startAt ?? current.dueAt ?? null
  if (primary === null) return null

  const nextMs = nextOccurrence(rule, primary, current.recurrenceIndex)
  if (nextMs === null) return null

  const next = { ...current } as T
  const hadStart = current.startAt !== null && current.startAt !== undefined
  const duration =
    current.endAt !== null && current.endAt !== undefined && current.endAt > primary
      ? current.endAt - primary
      : null

  if (hadStart) {
    next.startAt = nextMs
    next.dueAt = null
  } else {
    next.dueAt = nextMs
    next.startAt = null
  }
  next.endAt = duration !== null ? nextMs + duration : null
  next.recurrenceIndex = current.recurrenceIndex + 1
  return {
    ...next,
    id: options.nextId,
    seriesId: current.seriesId,
    recurrenceIndex: current.recurrenceIndex + 1,
    done: false,
  }
}


/** 从标题里裁掉重复短语（「每周五」「每两周的周一」「每月31号」），避免标题残留「每」 */
export function stripRecurrencePhrase(text: string): string {
  let out = text
  // 每(隔)N天
  out = out.replace(/每\s*(?:隔\s*)?(?:\d+|[一二两三四五六七八九十]+)?\s*(?:天|日)/g, ' ')
  // 每(隔)N周(的)?周X(、周Y…)
  out = out.replace(
    /每\s*(?:隔\s*)?(?:\d+|[一二两三四五六七八九十]+)?\s*个?\s*(?:周|星期|礼拜)(?:的)?(?:\s*(?:周|星期|礼拜)?[一二三四五六日天])*/g,
    ' ',
  )
  // 每(隔)N个?月(的)?N号/日
  out = out.replace(
    /每\s*(?:隔\s*)?(?:\d+|[一二两三四五六七八九十]+)?\s*个?\s*月(?:的)?\s*(?:\d+|[一二两三四五六七八九十]+)\s*[号日]/g,
    ' ',
  )
  // 共N次 / 到…日期：属于规则修饰，一并从标题去掉
  out = out.replace(/共\s*(?:\d+|[一二两三四五六七八九十]+)\s*次/g, ' ')
  out = out.replace(/(?:到|截止|至)\s*\d{4}年?\s*\d{1,2}月\s*\d{1,2}\s*[日号]/g, ' ')
  return out.replace(/\s{2,}/g, ' ').trim()
}
