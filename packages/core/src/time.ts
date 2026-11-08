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

/** 往后数 N 个工作日（跳过周六周日），返回当天 00:00 */
export function addWorkdays(input: Date, count: number): Date {
  const d = new Date(input)
  let remaining = count
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    const weekday = d.getDay()
    if (weekday !== 0 && weekday !== 6) remaining -= 1
  }
  d.setHours(0, 0, 0, 0)
  return d
}

interface DateHit {
  date: Date
  index: number
  length: number
  matched: string
  ambiguous: boolean
  /** 该短语本身是否已经指明了「日」这个精度（用于覆盖默认时刻） */
  hasDayPrecision: boolean
  /** 需要写进 reasons 的「假设说明」（月底/学期末/工作日这类有解释成本的说法） */
  note?: string
  /** 强制使用的钟点（「工作日」默认 18:00），不被普通默认值覆盖 */
  forcedClock?: { hour: number; minute: number }
  /** 该短语本身含截止语义（如「月底前」「工作日」下班前） */
  deadlineHint?: boolean
  /** 「本周日」落在周日当天时的双候选：本周=今天、下周=7 天后 */
  weekBoundary?: { thisWeek: number; nextWeek: number }
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

  // 0-a) 月底 / 本月末 → 本月最后一天
  //     （排除「下个月底」，那个不在本版支持范围，避免误命中本月）
  let m = /(?<!下个)月[底末]/.exec(text)
  if (m) {
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return {
      date: lastDay,
      index: m.index,
      length: m[0].length,
      matched: m[0],
      ambiguous: true,
      hasDayPrecision: true,
      note: '「月底」按本月最后一天理解',
      deadlineHint: true,
    }
  }

  // 0-b) 下个月初 / 下月初 → 次月 1 日
  m = /下个?月(?:初|月初)/.exec(text)
  if (m) {
    const firstDay = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    return {
      date: firstDay,
      index: m.index,
      length: m[0].length,
      matched: m[0],
      ambiguous: true,
      hasDayPrecision: true,
      note: '「下个月初」按次月 1 日理解',
      deadlineHint: true,
    }
  }

  // 0-c) 本学期末 / 学期末 → 最近的 1 月 15 日或 7 月 15 日（取未来最近的一个）
  m = /(?:本)?学期[末底]/.exec(text)
  if (m) {
    const candidates: Date[] = []
    for (let yearOffset = 0; yearOffset <= 1; yearOffset += 1) {
      const year = today.getFullYear() + yearOffset
      candidates.push(new Date(year, 0, 15))
      candidates.push(new Date(year, 6, 15))
    }
    const future = candidates
      .filter((date) => startOfDay(date).getTime() >= today.getTime())
      .sort((a, b) => a.getTime() - b.getTime())
    const target = future[0] ?? candidates[candidates.length - 1]
    return {
      date: target,
      index: m.index,
      length: m[0].length,
      matched: m[0],
      ambiguous: true,
      hasDayPrecision: true,
      note: `「学期末」按最近的学期边界理解（${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-15）`,
      deadlineHint: true,
    }
  }

  // 0-d) 工作日
  //   「工作日」单独出现：今天是工作日且未到 18:00 → 今天 18:00；否则下一个工作日 18:00
  //   「N 个工作日内」：跳过周末往后数 N 个工作日
  //   「周三工作日」这类（日期 + 工作日）不在这里处理，交给 extractTime 的顺延规则
  const workdayCount = new RegExp(`(${NUM})\\s*个\\s*工作日`).exec(text)
  const workdayIndex = text.indexOf('工作日')
  const precededByWeekday =
    workdayIndex > 0 && /(?:周|星期|礼拜)[一二三四五六日天1-7]\s*$/.test(text.slice(0, workdayIndex))
  const standaloneWorkday = workdayIndex >= 0 && !precededByWeekday ? { index: workdayIndex, text: '工作日' } : null
  if (workdayCount) {
    const n = cnToInt(workdayCount[1])
    if (n && n > 0 && n <= 60) {
      return {
        date: addWorkdays(today, n),
        index: workdayCount.index,
        length: workdayCount[0].length,
        matched: workdayCount[0],
        ambiguous: false,
        hasDayPrecision: true,
        note: `「${workdayCount[1]} 个工作日」按跳过周末计算`,
        deadlineHint: true,
      }
    }
  }
  if (standaloneWorkday) {
    const isWorkday = isoWeekday(today) <= 5
    const beforeSixPm = ref.getHours() < 18
    const useToday = isWorkday && beforeSixPm
    const date = useToday ? today : addWorkdays(today, 1)
    return {
      date,
      index: standaloneWorkday.index,
      length: 3,
      matched: standaloneWorkday.text,
      ambiguous: true,
      hasDayPrecision: true,
      forcedClock: { hour: 18, minute: 0 },
      deadlineHint: true,
      note: useToday
        ? '今天是工作日，未到 18:00 → 今天 18:00'
        : '已过 18:00/今天非工作日 → 下一个工作日 18:00',
    }
  }

  // 0-e) 每月 N 号（重复规则里的日期锚点）：给出「下一次」的日期，供规则引擎生成待办
  m = new RegExp(`每\\s*(?:隔\\s*)?(${NUM})?\\s*个?\\s*月(?:的)?\\s*(${NUM})\\s*[号日]`).exec(text)
  if (m) {
    const day = cnToInt(m[2])
    if (day && day >= 1 && day <= 31) {
      const clamp = (year: number, month0: number) =>
        Math.min(day, new Date(year, month0 + 1, 0).getDate())
      let d = new Date(today.getFullYear(), today.getMonth(), clamp(today.getFullYear(), today.getMonth()))
      if (startOfDay(d).getTime() < today.getTime()) {
        const nextMonth0 = today.getMonth() + 1
        const year = today.getFullYear() + Math.floor(nextMonth0 / 12)
        const month0 = nextMonth0 % 12
        d = new Date(year, month0, clamp(year, month0))
      }
      return {
        date: d,
        index: m.index,
        length: m[0].length,
        matched: m[0],
        ambiguous: true,
        hasDayPrecision: true,
        note: `每月 ${day} 号`,
      }
    }
  }

  // 1) 2026-11-18 / 2026年11月18日
  m = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*[日号]?/.exec(text)
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

      // 「本周日」恰好落在周日当天 → 本周=今天 vs 下周=7 天后，产出双候选
      const isThisWeekSunday = (base === '本' || base === '这') && wd === 7
      if (isThisWeekSunday && target.getTime() === today.getTime()) {
        return {
          date: target,
          index: m.index,
          length: m[0].length,
          matched: m[0],
          ambiguous: true,
          hasDayPrecision: true,
          weekBoundary: { thisWeek: today.getTime(), nextWeek: addDays(today, 7).getTime() },
        }
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
  /** 时段词（上午/下午/晚上）的独立区间：它可能和钟点隔着字，必须单独删 */
  periodStart: number | null
  periodEnd: number | null
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
  const windowStart = Math.max(0, index - 4)
  const window = text.slice(windowStart, index)
  const periodMatch = /(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|晚间|夜间|晚)/.exec(window)
  const period = periodMatch ? periodMatch[1] : null
  // 时段词单独记区间：紧贴「下午3点」时自然与钟点相邻，
  // 隔着字（「上午会议9点」）时也能各自删掉，不会连带吃掉中间正文
  const periodStart = periodMatch ? windowStart + periodMatch.index : null
  const periodEnd = periodMatch ? periodStart! + periodMatch[0].length : null

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

  return { hour: normalized, minute, index, length, matched: m?.[0] ?? '', period, periodStart, periodEnd, ambiguous }
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
  /** 日期短语在原文中的区间（用于从标题里精确裁掉，避免连带删掉中间正文） */
  dateStart: number
  dateEnd: number
  /** 钟点短语在原文中的区间；没有钟点时两个都为 null */
  clockStart: number | null
  clockEnd: number | null
  /** 时段词（上午/下午/晚上）的独立区间；没有时段词时为 null */
  periodStart: number | null
  periodEnd: number | null
  /** 「月底 / 学期末 / 工作日」这类需要解释的假设，直接进 reasons */
  note?: string
  /** 「本周日」落在周日当天时的双候选（本周 / 下周） */
  weekBoundary?: { thisWeek: number; nextWeek: number }
}

/**
 * 抽取一句话里的时间信息。
 * 返回 null 表示这句话没有可用的时间线索 —— 调用方应当把它降级为「待确认」。
 */
export function extractTime(text: string, ref: Date = new Date()): TimeHit | null {
  let dateHit = resolveDate(text, ref)
  const clockHit = resolveClock(text)

  // 「下周三工作日」这类：先解析日期，周末则顺延到下一个工作日，时刻固定 18:00
  // （「N 个工作日」已在 resolveDate 里算好，不再二次处理）
  if (dateHit && !dateHit.forcedClock && /工作日/.test(text) && !dateHit.note?.includes('个工作日')) {
    const weekday = dateHit.date.getDay()
    if (weekday === 0 || weekday === 6) {
      const shifted = addDays(dateHit.date, weekday === 6 ? 2 : 1)
      dateHit = {
        ...dateHit,
        date: shifted,
        forcedClock: { hour: 18, minute: 0 },
        deadlineHint: true,
        ambiguous: true,
        note: '该日期是周末，已顺延到下一个工作日 18:00',
      }
    } else {
      dateHit = {
        ...dateHit,
        forcedClock: { hour: 18, minute: 0 },
        deadlineHint: true,
        ambiguous: true,
        note: '按工作日 18:00 理解',
      }
    }
  }

  if (!dateHit && !clockHit) return null

  const isDeadline = DEADLINE_RE.test(text) || (dateHit?.deadlineHint ?? false)

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
      dateStart: clockHit.index,
      dateEnd: clockHit.index,
      clockStart: clockHit.index,
      clockEnd: clockHit.index + clockHit.length,
      periodStart: clockHit.periodStart,
      periodEnd: clockHit.periodEnd,
    }
  }

  const date = dateHit!.date
  // 「工作日」这类短语会强制一个钟点（18:00），且文本里没有钟点词
  const forcedClock = clockHit ? null : (dateHit!.forcedClock ?? null)
  const hasClock = Boolean(clockHit) || Boolean(forcedClock)
  const clockHour = clockHit ? clockHit.hour : forcedClock?.hour
  const clockMinute = clockHit ? clockHit.minute : forcedClock?.minute
  const atMs =
    hasClock && clockHour !== undefined && clockMinute !== undefined
      ? setClock(date, clockHour, clockMinute).getTime()
      : null

  const dateStart = dateHit!.index
  const dateEnd = dateHit!.index + dateHit!.length
  const clockStart = clockHit ? clockHit.index : null
  const clockEnd = clockHit ? clockHit.index + clockHit.length : null

  // matched 只用于「为什么这么判断」的展示，取两端覆盖即可
  const spanStart = Math.min(dateStart, clockStart ?? dateStart, clockHit?.periodStart ?? Number.MAX_SAFE_INTEGER)
  const spanEnd = Math.max(dateEnd, clockEnd ?? dateEnd)

  return {
    dateMs: startOfDay(date).getTime(),
    atMs,
    hasClock,
    isDeadline,
    ambiguous: dateHit!.ambiguous || Boolean(clockHit?.ambiguous),
    matched: text.slice(spanStart, spanEnd).trim(),
    dateStart,
    dateEnd,
    clockStart,
    clockEnd,
    periodStart: clockHit?.periodStart ?? null,
    periodEnd: clockHit?.periodEnd ?? null,
    note: dateHit!.note,
    weekBoundary: dateHit!.weekBoundary,
  }
}

export function setClock(date: Date, hour: number, minute: number): Date {
  const d = new Date(date)
  d.setHours(hour, minute, 0, 0)
  return d
}
