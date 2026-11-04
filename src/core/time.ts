/**
 * 中文相对时间归一化引擎
 * ------------------------------------------------------------------
 * 这是整个作品的技术核心：群消息里的时间是「人话」，不是 ISO 8601。
 *   「本周五23:59前」「下周三之前」「明晚8点」「3天内」「11月18日」
 * 只有把这些先归一化成绝对时刻，后面的冲突检测、倒计时才有意义。
 *
 * 设计约束：
 *  1. 纯函数，注入 ref 作为「现在」，因此任何时刻都可确定性复现 —— 单测不留时间炸弹。
 *  2. 不依赖任何第三方库（不用 dayjs/chrono），因为中文口语规则需要自己掌控。
 *  3. 每个结果都带 ambiguous 标记，可疑的交给用户确认，绝不静默瞎猜。
 */

const CN_DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

/** 「十八」「十一」「三十一」「8」→ 数字 */
export function cnToInt(input: string): number | null {
  if (!input) return null
  if (/^\d+$/.test(input)) return Number(input)
  const tenIndex = input.indexOf('十')
  if (tenIndex === -1) {
    let value = 0
    for (const ch of input) {
      const digit = CN_DIGIT[ch]
      if (digit === undefined) return null
      value = value * 10 + digit
    }
    return value
  }
  const head = input.slice(0, tenIndex)
  const tail = input.slice(tenIndex + 1)
  const headValue = head ? CN_DIGIT[head] : 1
  if (headValue === undefined) return null
  if (!tail) return headValue * 10
  if (tail.length !== 1) return null
  const tailValue = CN_DIGIT[tail]
  if (tailValue === undefined) return null
  return headValue * 10 + tailValue
}

const NUM = '(?:\\d{1,2}|[一二三四五六七八九十]{1,3})'

export const MS_DAY = 86_400_000

/** 当天 00:00:00 */
export function startOfDay(input: Date): Date {
  const d = new Date(input)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(input: Date, days: number): Date {
  const d = new Date(input)
  d.setDate(d.getDate() + days)
  return d
}

/** 周一 = 1 … 周日 = 7 */
export function isoWeekday(input: Date): number {
  return ((input.getDay() + 6) % 7) + 1
}

interface DateHit {
  date: Date
  index: number
  length: number
  matched: string
  ambiguous: boolean
  /** 该短语本身是否已经指明了「日」这个精度（用于覆盖默认时刻） */
  hasDayPrecision: boolean
}

const REL_DAY: Array<[string, number]> = [
  ['大后天', 3],
  ['后天', 2],
  ['明晚', 1],
  ['明早', 1],
  ['明天', 1],
  ['明日', 1],
  ['今晚', 0],
  ['今早', 0],
  ['今天', 0],
  ['今日', 0],
]

const WEEKDAY_BASE: Record<string, number> = {
  下下: 14,
  下个: 7,
  下: 7,
  本: 0,
  这: 0,
  上: -7,
}

/** 在文本里找「那一天」。只返回最可靠的一处，避免一段话里多时间互相污染。 */
function resolveDate(text: string, ref: Date): DateHit | null {
  const today = startOfDay(ref)

  // 1) 2026-11-18 / 2026年11月18日
  let m = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*[日号]?/.exec(text)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    if (isValidDate(d)) {
      return { date: d, index: m.index, length: m[0].length, matched: m[0], ambiguous: false, hasDayPrecision: true }
    }
  }

  // 2) 11月18日 / 十一月十八号
  const mdRe = new RegExp(`(${NUM})\\s*月\\s*(${NUM})\\s*[日号]?`)
  m = mdRe.exec(text)
  if (m) {
    const month = cnToInt(m[1])
    const day = cnToInt(m[2])
    if (month && day && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let d = new Date(today.getFullYear(), month - 1, day)
      // 已经过去的日期，按「明年」理解，但标记为需要确认
      let ambiguous = false
      if (startOfDay(d).getTime() < today.getTime()) {
        d = new Date(today.getFullYear() + 1, month - 1, day)
        ambiguous = true
      }
      return { date: d, index: m.index, length: m[0].length, matched: m[0], ambiguous, hasDayPrecision: true }
    }
  }

  // 3) 11/18、11.18
  m = /(\d{1,2})\s*[/.]\s*(\d{1,2})(?!\d)/.exec(text)
  if (m) {
    const month = Number(m[1])
    const day = Number(m[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let d = new Date(today.getFullYear(), month - 1, day)
      let ambiguous = false
      if (startOfDay(d).getTime() < today.getTime()) {
        d = new Date(today.getFullYear() + 1, month - 1, day)
        ambiguous = true
      }
      return { date: d, index: m.index, length: m[0].length, matched: m[0], ambiguous, hasDayPrecision: true }
    }
  }

  // 4) 本周五 / 下周三 / 星期五 / 周日
  m = /(下下|下个|下|本|这|上)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天1-7])/.exec(text)
  if (m) {
    const base = m[1]
    const rawWd = m[2]
    const wd = rawWd === '日' || rawWd === '天' ? 7 : cnToInt(rawWd)
    if (wd && wd >= 1 && wd <= 7) {
      const monday = addDays(today, -(isoWeekday(today) - 1))
      let target = addDays(monday, wd - 1)
      let ambiguous = false
      if (base === undefined) {
        // 光说「周五」：取最近的那个未来周五
        if (target.getTime() < today.getTime()) target = addDays(target, 7)
      } else {
        target = addDays(target, WEEKDAY_BASE[base] ?? 0)
        // 「本周五」已经过去时，语义确实含糊，交给人确认
        if (target.getTime() < today.getTime()) ambiguous = true
      }
      return { date: target, index: m.index, length: m[0].length, matched: m[0], ambiguous, hasDayPrecision: true }
    }
  }

  // 5) 今天 / 明天 / 后天 / 今晚
  let best: { kw: string; offset: number; index: number } | null = null
  for (const [kw, offset] of REL_DAY) {
    const index = text.indexOf(kw)
    if (index === -1) continue
    if (!best || index < best.index) best = { kw, offset, index }
  }
  if (best) {
    return {
      date: addDays(today, best.offset),
      index: best.index,
      length: best.kw.length,
      matched: best.kw,
      ambiguous: false,
      hasDayPrecision: true,
    }
  }

  // 6) 3天内 / 两天后
  const ndRe = new RegExp(`(${NUM})\\s*(?:个)?\\s*[天日]\\s*(?:之)?\\s*(?:内|后|以内)`)
  m = ndRe.exec(text)
  if (m) {
    const n = cnToInt(m[1])
    if (n && n > 0 && n <= 60) {
      return {
        date: addDays(today, n),
        index: m.index,
        length: m[0].length,
        matched: m[0],
        ambiguous: false,
        hasDayPrecision: true,
      }
    }
  }

  return null
}

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime())
}

const PM_PERIODS = new Set(['下午', '傍晚', '晚上', '晚间', '夜间', '夜里', '晚'])

interface ClockHit {
  hour: number
  minute: number
  index: number
  length: number
  matched: string
  period: string | null
  ambiguous: boolean
}

/** 找「几点几分」，并把上午/下午折算成 0-23 */
function resolveClock(text: string): ClockHit | null {
  let hour: number | null = null
  let minute = 0
  let index = 0
  let length = 0

  // a) 23:59 / 8：30
  let m = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(text)
  if (m) {
    hour = Number(m[1])
    minute = Number(m[2])
    index = m.index
    length = m[0].length
  } else {
    // b) 8点 / 八点半 / 8点30分
    const re = new RegExp(`(${NUM})\\s*[点點时時]\\s*(半|${NUM}\\s*分?)?`)
    m = re.exec(text)
    if (m) {
      hour = cnToInt(m[1])
      length = m[0].length
      index = m.index
      const tail = (m[2] ?? '').replace('分', '').trim()
      if (tail === '半') minute = 30
      else if (tail) minute = cnToInt(tail) ?? 0
    }
  }

  if (hour === null || Number.isNaN(hour) || hour > 24) return null
  if (minute > 59) minute = 0

  // 从「几点」往前找时段词，只往前看 4 个字符，避免跨句污染
  const window = text.slice(Math.max(0, index - 4), index)
  const periodMatch = /(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|晚间|夜间|晚)/.exec(window)
  const period = periodMatch ? periodMatch[1] : null

  let normalized = hour
  let ambiguous = false
  if (period) {
    if (PM_PERIODS.has(period)) {
      if (normalized < 12) normalized += 12
    } else if (period === '中午') {
      if (normalized < 12) normalized += 12
    } else if (period === '凌晨') {
      if (normalized === 12) normalized = 0
    }
  } else if (hour >= 1 && hour <= 7) {
    // 光说「8点」：上午还是晚上说不准
    ambiguous = true
  }

  return { hour: normalized, minute, index, length, matched: m?.[0] ?? '', period, ambiguous }
}

/** 截止语义的关键词 */
const DEADLINE_RE = /(之前|以前|截止|截至|之内|以内)|(?<![提往目])前/

export interface TimeHit {
  /** 当天 00:00 的时间戳 */
  dateMs: number
  /** 精确到分的时刻（无具体钟点时是 null） */
  atMs: number | null
  hasClock: boolean
  isDeadline: boolean
  ambiguous: boolean
  /** 命中的原文 */
  matched: string
  /** 在原文中的区间，用于从标题里裁掉时间短语 */
  start: number
  end: number
}

/**
 * 抽取一句话里的时间信息。
 * 返回 null 表示这句话没有可用的时间线索 —— 调用方应当把它降级为「待确认」。
 */
export function extractTime(text: string, ref: Date = new Date()): TimeHit | null {
  const dateHit = resolveDate(text, ref)
  const clockHit = resolveClock(text)

  if (!dateHit && !clockHit) return null

  const isDeadline = DEADLINE_RE.test(text)

  if (!dateHit && clockHit) {
    // 「晚上8点开会」：只有钟点没有日期，按最近一次未过期的时刻算
    let date = startOfDay(ref)
    let at = setClock(date, clockHit.hour, clockHit.minute)
    if (at.getTime() < ref.getTime()) {
      date = addDays(date, 1)
      at = setClock(date, clockHit.hour, clockHit.minute)
    }
    return {
      dateMs: date.getTime(),
      atMs: at.getTime(),
      hasClock: true,
      isDeadline,
      ambiguous: true,
      matched: clockHit.matched,
      start: clockHit.index,
      end: clockHit.index + clockHit.length,
    }
  }

  const date = dateHit!.date
  const hasClock = Boolean(clockHit)
  const atMs = clockHit ? setClock(date, clockHit.hour, clockHit.minute).getTime() : null

  const start = dateHit!.index
  const end = clockHit ? Math.max(dateHit!.index + dateHit!.length, clockHit.index + clockHit.length) : dateHit!.index + dateHit!.length

  return {
    dateMs: startOfDay(date).getTime(),
    atMs,
    hasClock,
    isDeadline,
    ambiguous: dateHit!.ambiguous || Boolean(clockHit?.ambiguous),
    matched: text.slice(start, end).trim(),
    start,
    end,
  }
}

export function setClock(date: Date, hour: number, minute: number): Date {
  const d = new Date(date)
  d.setHours(hour, minute, 0, 0)
  return d
}
