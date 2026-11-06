import { describe, it, expect } from 'vitest'
import { cnToInt, extractTime, isoWeekday, addDays } from './time'

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
