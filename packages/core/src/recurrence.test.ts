import { describe, expect, it } from 'vitest'
import {
  daysInMonth,
  describeRule,
  looksRecurring,
  nextOccurrence,
  parseRecurrenceInput,
  parseRRule,
  ruleToRRule,
  type RecurRule,
} from './recurrence.js'

const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime()

describe('parseRecurrenceInput 中文 → 规则', () => {
  it.each([
    ['每周五', { freq: 'WEEKLY', interval: 1, byDay: [5] }],
    ['每两周的周一和周四', { freq: 'WEEKLY', interval: 2, byDay: [1, 4] }],
    ['每月1号', { freq: 'MONTHLY', interval: 1, anchorDay: 1 }],
    ['每月31号', { freq: 'MONTHLY', interval: 1, anchorDay: 31 }],
    ['每隔两天', { freq: 'DAILY', interval: 2 }],
    ['每天', { freq: 'DAILY', interval: 1 }],
    ['每周一，共5次', { freq: 'WEEKLY', interval: 1, byDay: [1], count: 5 }],
  ])('%s', (text, expected) => {
    const rule = parseRecurrenceInput(text)!
    expect(rule).toMatchObject(expected)
  })

  it('解析「到 12 月 31 日」为 UNTIL（含当天 23:59:59）', () => {
    const rule = parseRecurrenceInput('每周一，到2026年12月31日')!
    expect(rule.until).toBe(new Date(2026, 11, 31, 23, 59, 59, 999).getTime())
  })

  it('不是重复说法 → null', () => {
    expect(parseRecurrenceInput('本周五交报告')).toBeNull()
    expect(looksRecurring('本周五交报告')).toBe(false)
    expect(looksRecurring('每周五开会')).toBe(true)
  })
})

describe('ruleToRRule / parseRRule 往返', () => {
  it('每周五 COUNT=5', () => {
    const rule: RecurRule = { freq: 'WEEKLY', interval: 1, byDay: [5], count: 5 }
    expect(ruleToRRule(rule)).toBe('FREQ=WEEKLY;BYDAY=FR;COUNT=5')
    expect(parseRRule(ruleToRRule(rule))).toMatchObject(rule)
  })

  it('每两周周一/周四', () => {
    const rule: RecurRule = { freq: 'WEEKLY', interval: 2, byDay: [1, 4] }
    expect(ruleToRRule(rule)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH')
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH')).toMatchObject(rule)
  })

  it('每月 31 号', () => {
    const rule: RecurRule = { freq: 'MONTHLY', interval: 1, anchorDay: 31 }
    expect(ruleToRRule(rule)).toBe('FREQ=MONTHLY;BYMONTHDAY=31')
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=31')).toMatchObject(rule)
  })

  it('UNTIL 往返（UTC 解析）', () => {
    const rule: RecurRule = { freq: 'DAILY', interval: 1, until: Date.UTC(2026, 11, 31, 23, 59, 59) }
    const text = ruleToRRule(rule)
    expect(text).toContain('UNTIL=20261231T235959Z')
    expect(parseRRule(text)?.until).toBe(rule.until)
  })

  it('不支持的 RRULE → null（YEARLY / BYDAY+MONTHLY / BYSETPOS）', () => {
    expect(parseRRule('FREQ=YEARLY')).toBeNull()
    expect(parseRRule('FREQ=MONTHLY;BYDAY=MO')).toBeNull()
    expect(parseRRule('FREQ=WEEKLY;BYSETPOS=1')).toBeNull()
  })
})

describe('describeRule 可读描述', () => {
  it.each([
    [{ freq: 'DAILY', interval: 1 } as RecurRule, '每天'],
    [{ freq: 'DAILY', interval: 3 } as RecurRule, '每隔 3 天'],
    [{ freq: 'WEEKLY', interval: 1, byDay: [5] } as RecurRule, '每周周五'],
    [{ freq: 'WEEKLY', interval: 2, byDay: [1, 4] } as RecurRule, '每 2 周周一、周四'],
    [{ freq: 'MONTHLY', interval: 1, anchorDay: 31 } as RecurRule, '每月 31 号'],
  ])('%o → %s', (rule, text) => {
    expect(describeRule(rule)).toBe(text)
  })
})

describe('nextOccurrence：基本频率（A1）', () => {
  it('每周：+7 天，本地钟点不变', () => {
    const start = at(2026, 11, 6, 9) // 2026-11-06 周五 09:00
    const rule: RecurRule = { freq: 'WEEKLY', interval: 1, byDay: [5] }
    const next = nextOccurrence(rule, start, 0)!
    expect(new Date(next).getDay()).toBe(5)
    expect(new Date(next).getHours()).toBe(9)
    expect(new Date(next).getDate()).toBe(13)
  })

  it('每两周：+14 天', () => {
    const start = at(2026, 11, 6, 9)
    const rule: RecurRule = { freq: 'WEEKLY', interval: 2, byDay: [5] }
    expect(new Date(nextOccurrence(rule, start, 0)!).getDate()).toBe(20)
  })

  it('每月：下月同一天', () => {
    const rule: RecurRule = { freq: 'MONTHLY', interval: 1, anchorDay: 15 }
    const next = nextOccurrence(rule, at(2026, 11, 15), 0)!
    expect(new Date(next).getMonth()).toBe(11) // 12 月
    expect(new Date(next).getDate()).toBe(15)
  })

  it('每月 31 号：2 月 clamp 28，3 月回到 31（锚定原始日）', () => {
    const rule: RecurRule = { freq: 'MONTHLY', interval: 1, anchorDay: 31 }
    const feb = nextOccurrence(rule, at(2026, 1, 31), 0)!
    expect(new Date(feb).getMonth()).toBe(1) // 2 月
    expect(new Date(feb).getDate()).toBe(28)

    const mar = nextOccurrence(rule, feb, 1)!
    expect(new Date(mar).getMonth()).toBe(2) // 3 月
    expect(new Date(mar).getDate()).toBe(31)
  })

  it('每月 31 号：闰年 2 月 clamp 29', () => {
    const rule: RecurRule = { freq: 'MONTHLY', interval: 1, anchorDay: 31 }
    const feb = nextOccurrence(rule, at(2028, 1, 31), 0)!
    expect(new Date(feb).getDate()).toBe(29)
  })

  it('每月 29 号：闰年 2 月 29、平年 2 月 28', () => {
    const rule: RecurRule = { freq: 'MONTHLY', interval: 1, anchorDay: 29 }
    expect(new Date(nextOccurrence(rule, at(2028, 1, 29), 0)!).getDate()).toBe(29) // 2028-02-29
    expect(new Date(nextOccurrence(rule, at(2027, 1, 29), 0)!).getDate()).toBe(28) // 2027-02-28
  })

  it('跨年：12 月每周 → 次年 1 月，星期正确', () => {
    const rule: RecurRule = { freq: 'WEEKLY', interval: 1, byDay: [5] }
    const next = nextOccurrence(rule, at(2026, 12, 25), 0)! // 12-25 周五
    expect(new Date(next).getFullYear()).toBe(2027)
    expect(new Date(next).getMonth()).toBe(0)
    expect(new Date(next).getDay()).toBe(5)
  })

  it('DST 周：本地钟点保持不变', () => {
    // 用日历日算术；本机 TZ 无 DST 时也成立，在 TZ=America/New_York 下更能验证
    const rule: RecurRule = { freq: 'DAILY', interval: 1 }
    const start = at(2026, 3, 7, 9) // 美国 DST 2026-03-08 开始
    const next = nextOccurrence(rule, start, 0)!
    expect(new Date(next).getHours()).toBe(9)
    expect(new Date(next).getDate()).toBe(8)
  })
})

describe('nextOccurrence：终止条件（A3）', () => {
  it('COUNT=5（含首次）：第 5 条完成后不再生成', () => {
    const rule: RecurRule = { freq: 'DAILY', interval: 1, count: 5 }
    expect(nextOccurrence(rule, at(2026, 11, 1), 0)).not.toBeNull()
    expect(nextOccurrence(rule, at(2026, 11, 1), 4)).toBeNull()
  })

  it('COUNT 边界：第 4 条（index=3）完成后仍生成第 5 条', () => {
    const rule: RecurRule = { freq: 'DAILY', interval: 1, count: 5 }
    expect(nextOccurrence(rule, at(2026, 11, 1), 3)).not.toBeNull()
  })

  it('UNTIL 含当天：最后一天的实例仍生成，再下一次不生成', () => {
    const rule: RecurRule = {
      freq: 'DAILY',
      interval: 1,
      until: new Date(2026, 11, 31, 23, 59, 59, 999).getTime(),
    }
    const dec30 = at(2026, 12, 30)
    const dec31 = nextOccurrence(rule, dec30, 0)!
    expect(new Date(dec31).getDate()).toBe(31)
    expect(nextOccurrence(rule, dec31, 1)).toBeNull()
  })

  it('无 COUNT/UNTIL：单步永远有下一次', () => {
    const rule: RecurRule = { freq: 'WEEKLY', interval: 1, byDay: [1] }
    expect(nextOccurrence(rule, at(2030, 1, 7), 999)).not.toBeNull()
  })
})

describe('daysInMonth', () => {
  it('闰年与平年', () => {
    expect(daysInMonth(2028, 1)).toBe(29)
    expect(daysInMonth(2027, 1)).toBe(28)
    expect(daysInMonth(2026, 11)).toBe(31)
  })
})
