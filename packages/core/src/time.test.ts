import { describe, it, expect } from 'vitest'
import { cnToInt, extractTime, isoWeekday, addDays } from './time.js'

/**
 * 固定「现在」为 2026-11-04 22:07（周三），所有断言都用本地时区构造，
 * 这样换机器、换时区都能得到同一结果 —— 时间类测试最怕的就是随时间漂移。
 */
const REF = new Date(2026, 10, 4, 22, 7, 0)

const at = (m: number, d: number, h: number, min: number) => new Date(2026, m - 1, d, h, min, 0).getTime()
const day = (m: number, d: number) => new Date(2026, m - 1, d, 0, 0, 0, 0).getTime()

describe('cnToInt 中文数字', () => {
  it.each([
    ['十八', 18],
    ['十一', 11],
    ['十', 10],
    ['三十一', 31],
    ['两', 2],
    ['8', 8],
    ['二十', 20],
  ])('%s → %i', (input, expected) => {
    expect(cnToInt(input)).toBe(expected)
  })

  it('无法识别的字符返回 null', () => {
    expect(cnToInt('abc')).toBeNull()
    expect(cnToInt('')).toBeNull()
  })
})

describe('参照日基准', () => {
  it('2026-11-04 是周三', () => {
    expect(isoWeekday(REF)).toBe(3)
  })
  it('addDays 跨月正确', () => {
    expect(addDays(new Date(2026, 10, 30), 2).getMonth()).toBe(11)
  })
})

describe('extractTime 相对时间归一化', () => {
  it('本周五23:59前：解析为绝对时刻并识别「截止」语义', () => {
    const hit = extractTime('本周五23:59前提交实验报告', REF)!
    expect(hit.atMs).toBe(at(11, 6, 23, 59))
    expect(hit.isDeadline).toBe(true)
    expect(hit.hasClock).toBe(true)
    expect(hit.ambiguous).toBe(false)
  })

  it('下周三之前：跨周且无钟点时只给到「天」', () => {
    const hit = extractTime('下周三之前把表交上来', REF)!
    expect(hit.dateMs).toBe(day(11, 11))
    expect(hit.atMs).toBeNull()
    expect(hit.hasClock).toBe(false)
    expect(hit.isDeadline).toBe(true)
  })

  it('11月18日：月日可直接转绝对日期', () => {
    const hit = extractTime('11月18日前完成课程设计', REF)!
    expect(hit.dateMs).toBe(day(11, 18))
    expect(hit.isDeadline).toBe(true)
    expect(hit.ambiguous).toBe(false)
  })

  it('明晚8点：相对日 + 时段折算成 20:00', () => {
    const hit = extractTime('明晚8点线上会议', REF)!
    expect(hit.atMs).toBe(at(11, 5, 20, 0))
    expect(hit.hasClock).toBe(true)
  })

  it('下午2点：下午折算 +12 小时', () => {
    const hit = extractTime('今天下午2点开会', REF)!
    expect(hit.atMs).toBe(at(11, 4, 14, 0))
  })

  it('上午9点：上午不折算', () => {
    const hit = extractTime('周五上午9点答辩', REF)!
    expect(hit.atMs).toBe(at(11, 6, 9, 0))
  })

  it('3天内：N 天后的截止', () => {
    const hit = extractTime('3天内完成问卷', REF)!
    expect(hit.dateMs).toBe(day(11, 7))
  })

  it('只有钟点没有日期时，推到最近一次未过期的时刻并标记待确认', () => {
    const hit = extractTime('晚上8点班会', REF)!
    expect(hit.atMs).toBe(at(11, 5, 20, 0))
    expect(hit.ambiguous).toBe(true)
  })

  it('已过去的月日按明年理解，但必须标记待确认', () => {
    const hit = extractTime('10月1日前交材料', REF)!
    expect(new Date(hit.dateMs)).toEqual(new Date(2027, 9, 1, 0, 0, 0, 0))
    expect(hit.ambiguous).toBe(true)
  })

  it('光说「周五」取最近的未来周五', () => {
    const hit = extractTime('周五下班前交', REF)!
    expect(hit.dateMs).toBe(day(11, 6))
  })

  it('覆盖区间可用于从标题里裁掉时间短语', () => {
    const text = '请于本周五23:59前提交'
    const hit = extractTime(text, REF)!
    expect(text.slice(hit.dateStart, hit.dateEnd)).toContain('本周五')
    expect(text.slice(hit.clockStart!, hit.clockEnd!)).toContain('23:59')
  })

  it('完全没有时间线索时返回 null', () => {
    expect(extractTime('大家注意查收群文件', REF)).toBeNull()
  })
})

/** v0.7.0 新增的时间表达：月底 / 下个月初 / 学期末 / 工作日 / 周界 */
describe('v0.7.0 时间表达补充', () => {
  const SUN = new Date(2026, 10, 8, 10, 0, 0) // 周日 10:00
  const MON_MORNING = new Date(2026, 10, 9, 9, 0, 0) // 周一 09:00
  const MON_EVENING = new Date(2026, 10, 9, 19, 30, 0) // 周一 19:30
  const MAY = new Date(2026, 4, 10, 10, 0, 0) // 2026-05-10

  it('月底前 → 本月最后一天（时刻由规则引擎补 23:59）', () => {
    const hit = extractTime('月底前把报销单交了', REF)!
    expect(hit.dateMs).toBe(day(11, 30))
    expect(hit.hasClock).toBe(false)
    expect(hit.isDeadline).toBe(true)
    expect(hit.note).toContain('月底')
    expect(hit.ambiguous).toBe(true)
  })

  it('下个月初 → 次月 1 日 23:59', () => {
    const hit = extractTime('下个月初统一提交', REF)!
    expect(hit.dateMs).toBe(day(12, 1))
    expect(hit.note).toContain('次月 1 日')
    expect(hit.ambiguous).toBe(true)
  })

  it('本学期末 → 最近的 1/15 或 7/15（11 月看到的应是次年 1-15）', () => {
    const hit = extractTime('本学期末交实习报告', REF)!
    expect(hit.dateMs).toBe(new Date(2027, 0, 15, 0, 0, 0, 0).getTime())
    expect(hit.note).toContain('2027-01-15')
  })

  it('本学期末在 5 月看到 → 当年 7-15', () => {
    const hit = extractTime('本学期末交实习报告', MAY)!
    expect(hit.dateMs).toBe(new Date(2026, 6, 15, 0, 0, 0, 0).getTime())
  })

  it('工作日单独出现（周日）→ 下一个工作日 18:00', () => {
    const hit = extractTime('工作日把材料交一下', SUN)!
    expect(hit.dateMs).toBe(day(11, 9))
    expect(hit.atMs).toBe(at(11, 9, 18, 0))
    expect(hit.hasClock).toBe(true)
    expect(hit.note).toContain('下一个工作日')
    expect(hit.ambiguous).toBe(true)
  })

  it('工作日单独出现（周一 09:00，未到 18 点）→ 今天 18:00', () => {
    const hit = extractTime('工作日提交', MON_MORNING)!
    expect(hit.dateMs).toBe(day(11, 9))
    expect(hit.atMs).toBe(at(11, 9, 18, 0))
    expect(hit.note).toContain('今天 18:00')
  })

  it('工作日单独出现（周一 19:30，已过 18 点）→ 下一个工作日 18:00', () => {
    const hit = extractTime('工作日提交', MON_EVENING)!
    expect(hit.dateMs).toBe(day(11, 10))
    expect(hit.atMs).toBe(at(11, 10, 18, 0))
    expect(hit.note).toContain('已过 18:00')
  })

  it('3 个工作日内 → 跳过周末数 3 个工作日', () => {
    // REF = 周三 11-04 → 周四(1) 周五(2) 周一(3) = 11-09
    const hit = extractTime('3个工作日内回复', REF)!
    expect(hit.dateMs).toBe(day(11, 9))
    expect(hit.note).toContain('工作日')
    expect(hit.isDeadline).toBe(true)
  })

  it('本周日恰好是周日当天 → 返回 weekBoundary 双候选', () => {
    const hit = extractTime('本周日交周报', SUN)!
    expect(hit.weekBoundary).toEqual({ thisWeek: day(11, 8), nextWeek: day(11, 15) })
  })

  it('本周日不在周日当天 → 不产生双候选', () => {
    const hit = extractTime('本周日交周报', REF)!
    expect(hit.weekBoundary).toBeUndefined()
    expect(hit.dateMs).toBe(day(11, 8))
  })
})

describe('v0.7.0 补充口径', () => {
  it('学期末当天（7-15）→ 就是今天，不跳到下一学期', () => {
    const midJuly = new Date(2026, 6, 15, 10, 0, 0)
    const hit = extractTime('本学期末交报告', midJuly)!
    expect(hit.dateMs).toBe(new Date(2026, 6, 15, 0, 0, 0, 0).getTime())
    expect(hit.note).toContain('2026-07-15')
  })

  it('学期末当天（1-15）→ 就是今天', () => {
    const midJan = new Date(2027, 0, 15, 9, 0, 0)
    const hit = extractTime('本学期末交报告', midJan)!
    expect(hit.dateMs).toBe(new Date(2027, 0, 15, 0, 0, 0, 0).getTime())
  })

  it('「下周三工作日」→ 周三 18:00（工作日顺延规则不触发）', () => {
    const hit = extractTime('下周三工作日把材料交了', REF)!
    expect(hit.dateMs).toBe(day(11, 11))
    expect(hit.atMs).toBe(at(11, 11, 18, 0))
    expect(hit.note).toContain('按工作日 18:00 理解')
  })

  it('日期落在周末时顺延到下一个工作日 18:00', () => {
    // REF = 周三 11-04，本周日 = 11-08（周日）→ 顺延到 11-09 周一
    const hit = extractTime('本周日工作日提交', REF)!
    expect(hit.dateMs).toBe(day(11, 9))
    expect(hit.atMs).toBe(at(11, 9, 18, 0))
    expect(hit.note).toContain('顺延')
  })
})
describe('v0.7.0 「下周日」口径（下一周的周日）', () => {
  it('今天周一 11-09 → 本周日 11-15，下周日 11-22', () => {
    const monday = new Date(2026, 10, 9, 9, 0, 0)
    const thisSunday = extractTime('本周日交报告', monday)!
    const nextSunday = extractTime('下周日交报告', monday)!
    expect(thisSunday.dateMs).toBe(day(11, 15))
    expect(nextSunday.dateMs).toBe(day(11, 22))
  })

  it('今天就是周日 → 下周日 = 今天 + 7 天', () => {
    const sunday = new Date(2026, 10, 8, 10, 0, 0)
    const nextSunday = extractTime('下周日交报告', sunday)!
    expect(nextSunday.dateMs).toBe(day(11, 15))
  })

  it('光说「周日」仍是最近的周日（不是下一周）', () => {
    const monday = new Date(2026, 10, 9, 9, 0, 0)
    const hit = extractTime('周日交报告', monday)!
    expect(hit.dateMs).toBe(day(11, 15))
  })
})