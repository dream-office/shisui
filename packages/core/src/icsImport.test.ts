import { describe, expect, it } from 'vitest'
import { importIcs, mergeIcsImport, unfoldIcsLines, unescapeIcsText } from './icsImport.js'
import type { ParsedTask } from './types.js'

function wrap(...events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR', ''].join('\r\n')
}

function event(lines: string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')
}

function makeId(index: number, uid: string | null): string {
  return `imported-${index}-${uid ?? 'noid'}`
}

describe('unfoldIcsLines / unescapeIcsText', () => {
  it('把续行拼回上一行', () => {
    const lines = unfoldIcsLines('SUMMARY:很长的\r\n 标题\r\nUID:1')
    expect(lines).toEqual(['SUMMARY:很长的标题', 'UID:1'])
  })

  it('反转义四种转义', () => {
    expect(unescapeIcsText('a\\,b\\;c\\\\d\\ne')).toBe('a,b;c\\d\ne')
  })
})

describe('importIcs', () => {
  it('解析 UTC 事件：标题、时间、UID、地点、描述', () => {
    const ics = wrap(
      event([
        'UID:event-1@example.com',
        'SUMMARY:项目评审',
        'DESCRIPTION:带上材料\\, 提前十分钟',
        'LOCATION:3 楼会议室',
        'DTSTART:20261120T010000Z',
        'DTEND:20261120T030000Z',
      ]),
    )
    const result = importIcs(ics, { makeId })

    expect(result.tasks).toHaveLength(1)
    const task = result.tasks[0]
    expect(task.title).toBe('项目评审')
    expect(task.startAt).toBe(Date.UTC(2026, 10, 20, 1, 0, 0))
    expect(task.endAt).toBe(Date.UTC(2026, 10, 20, 3, 0, 0))
    expect(task.dueAt).toBeNull()
    expect(task.kind).toBe('meeting')
    expect(task.location).toBe('3 楼会议室')
    expect(task.sourceUid).toBe('event-1@example.com')
    expect(task.engine).toBe('import')
    expect(task.rawText).toContain('带上材料, 提前十分钟')
    expect(result.skipped).toBe(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('全天事件：startAt=当日 00:00、allDay=true、单日无 endAt', () => {
    const ics = wrap(event(['UID:all-day', 'SUMMARY:报名截止', 'DTSTART;VALUE=DATE:20261120']))
    const result = importIcs(ics, { makeId })

    const task = result.tasks[0]
    expect(task.startAt).toBe(new Date(2026, 10, 20, 0, 0, 0, 0).getTime())
    expect(task.allDay).toBe(true)
    expect(task.endAt).toBeNull()
    expect(task.dueAt).toBeNull()
  })

  it('floating 时间按本地时间理解', () => {
    const ics = wrap(event(['UID:float', 'SUMMARY:例会', 'DTSTART:20261120T090000']))
    const result = importIcs(ics, { makeId })
    expect(result.tasks[0].startAt).toBe(new Date(2026, 10, 20, 9, 0, 0, 0).getTime())
  })

  it('TZID 用 Intl 换算成 UTC', () => {
    const ics = wrap(
      event(['UID:tz', 'SUMMARY:上海会议', 'DTSTART;TZID=Asia/Shanghai:20261120T090000']),
    )
    const task = importIcs(ics, { makeId }).tasks[0]
    // 上海 09:00 = UTC 01:00
    expect(task.startAt).toBe(Date.UTC(2026, 10, 20, 1, 0, 0))
  })

  it('不认识的 TZID：跳过并给 warning，不猜时区', () => {
    const ics = wrap(event(['UID:bad-tz', 'SUMMARY:怪时区', 'DTSTART;TZID=Mars/Olympus:20261120T090000']))
    const result = importIcs(ics, { makeId })

    expect(result.tasks).toHaveLength(0)
    expect(result.skipped).toBe(1)
    expect(result.warnings[0]).toContain('Mars/Olympus')
  })

  it('重复事件：保留 RRULE（不展开）', () => {
    const ics = wrap(
      event([
        'UID:weekly',
        'SUMMARY:每周例会',
        'DTSTART:20261120T090000Z',
        'RRULE:FREQ=WEEKLY;COUNT=10',
      ]),
    )
    const result = importIcs(ics, { makeId })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].rrule).toContain('FREQ=WEEKLY')
    expect(result.tasks[0].rrule).toContain('COUNT=10')
  })

  it('不支持的 RRULE：按单次导入并给 warning', () => {
    const ics = wrap(
      event(['UID:weird', 'SUMMARY:怪规则', 'DTSTART:20261120T090000Z', 'RRULE:FREQ=YEARLY']),
    )
    const result = importIcs(ics, { makeId })
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].rrule).toBeNull()
    expect(result.warnings.some((w) => w.includes('不受支持'))).toBe(true)
  })

  it('坏文件不抛异常，返回可读错误', () => {
    const result = importIcs('这不是日历文件')
    expect(result.tasks).toHaveLength(0)
    expect(result.warnings[0]).toContain('BEGIN:VCALENDAR')
  })

  it('空日历返回空结果且不告警', () => {
    const result = importIcs(wrap())
    expect(result.tasks).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('多天全天事件：startAt/endAt 完整保留（exclusive）', () => {
    const ics = wrap(
      event([
        'UID:multi',
        'SUMMARY:三天活动',
        'DTSTART;VALUE=DATE:20261120',
        'DTEND;VALUE=DATE:20261123',
      ]),
    )
    const result = importIcs(ics, { makeId })

    expect(result.tasks).toHaveLength(1)
    const task = result.tasks[0]
    expect(task.allDay).toBe(true)
    expect(task.startAt).toBe(new Date(2026, 10, 20, 0, 0, 0, 0).getTime())
    expect(task.endAt).toBe(new Date(2026, 10, 23, 0, 0, 0, 0).getTime())
    expect(result.warnings).toHaveLength(0)
  })

  it('单日全天带 DTEND=次日：endAt 照搬（exclusive）', () => {
    const ics = wrap(event(['UID:one-day', 'SUMMARY:单日全天', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261121']))
    const result = importIcs(ics, { makeId })
    expect(result.tasks[0].endAt).toBe(new Date(2026, 10, 21, 0, 0, 0, 0).getTime())
  })

  it('嵌套 VALARM 不会把其属性当成事件字段', () => {
    const ics = wrap(
      event([
        'UID:alarm',
        'SUMMARY:带提醒的事',
        'DTSTART:20261120T090000Z',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:提醒我',
        'TRIGGER:-PT15M',
        'END:VALARM',
      ]),
    )
    const task = importIcs(ics, { makeId }).tasks[0]
    expect(task.title).toBe('带提醒的事')
    expect(task.rawText).not.toContain('提醒我')
  })

  it('被截断的文件给出可读 warning，而不是返回空结果', () => {
    const truncated = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:半截'
    const result = importIcs(truncated)
    expect(result.tasks).toHaveLength(0)
    expect(result.warnings[0]).toContain('END:VEVENT')
  })

  it('定时事件没有 DTEND 时 endAt 按 30 分钟（与导出对称）', () => {
    const ics = wrap(event(['UID:no-end', 'SUMMARY:没有结束时间', 'DTSTART:20261120T010000Z']))
    const task = importIcs(ics, { makeId }).tasks[0]
    expect(task.startAt).toBe(Date.UTC(2026, 10, 20, 1, 0, 0))
    expect(task.endAt).toBe(Date.UTC(2026, 10, 20, 1, 30, 0))
    expect(task.dueAt).toBeNull()
  })

  it('同文件里坏事件跳过、好事件照常导入', () => {
    const ics = wrap(
      event(['UID:bad', 'SUMMARY:坏时区', 'DTSTART;TZID=Mars/Olympus:20261120T090000']),
      event(['UID:good', 'SUMMARY:好事件', 'DTSTART:20261120T010000Z']),
    )
    const result = importIcs(ics, { makeId })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].title).toBe('好事件')
    expect(result.skipped).toBe(1)
    expect(result.warnings).toHaveLength(1)
  })
})

describe('mergeIcsImport（去重）', () => {
  const parsed = (uid: string | null, title: string): ParsedTask => ({
    id: `new-${title}`,
    title,
    dueAt: null,
    startAt: Date.UTC(2026, 10, 20, 1, 0),
    kind: 'meeting',
    channel: null,
    location: null,
    rawText: title,
    confidence: 'high',
    reasons: [],
    engine: 'import',
    sourceUid: uid,
  })

  it('同 UID 已存在 → 更新（保留本地 id）', () => {
    const plan = mergeIcsImport([{ id: 'local-1', sourceUid: 'u1' }], [parsed('u1', '新标题')])
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0].id).toBe('local-1')
    expect(plan.toUpdate[0].title).toBe('新标题')
    expect(plan.toInsert).toHaveLength(0)
  })

  it('新 UID → 新增', () => {
    const plan = mergeIcsImport([], [parsed('u2', '新事件')])
    expect(plan.toInsert).toHaveLength(1)
    expect(plan.toUpdate).toHaveLength(0)
  })

  it('无 UID 的事件生成稳定合成 UID（重复导入不会翻倍）', () => {
    const file = wrap(event(['SUMMARY:没有 UID 的事件', 'DTSTART:20261120T090000Z']))
    const first = importIcs(file, { makeId }).tasks[0]
    const second = importIcs(file, { makeId }).tasks[0]

    expect(first.sourceUid ?? '').toMatch(/^syn-[0-9a-f]{8}$/)
    expect(second.sourceUid).toBe(first.sourceUid)

    // 合成 UID 让第二次导入走更新而不是新增
    const plan = mergeIcsImport([{ id: 'local-1', sourceUid: first.sourceUid }], [second])
    expect(plan.toInsert).toHaveLength(0)
    expect(plan.toUpdate).toHaveLength(1)
  })

  it('合成 UID 对标题/时间敏感', () => {
    const a = importIcs(wrap(event(['SUMMARY:甲', 'DTSTART:20261120T090000Z'])), { makeId }).tasks[0]
    const b = importIcs(wrap(event(['SUMMARY:乙', 'DTSTART:20261120T090000Z'])), { makeId }).tasks[0]
    const c = importIcs(wrap(event(['SUMMARY:甲', 'DTSTART:20261121T090000Z'])), { makeId }).tasks[0]

    expect(a.sourceUid).not.toBe(b.sourceUid)
    expect(a.sourceUid).not.toBe(c.sourceUid)
  })

  it('同一文件里重复 UID 只导入第一条', () => {
    const plan = mergeIcsImport([], [parsed('dup', 'A'), parsed('dup', 'B')])
    expect(plan.toInsert).toHaveLength(1)
    expect(plan.skipped).toHaveLength(1)
  })

  it('重复导入同一份文件：第二次全部走更新，不产生重复数据', () => {
    const file = importIcs(
      wrap(event(['UID:same', 'SUMMARY:旧标题', 'DTSTART:20261120T090000Z'])),
      { makeId },
    )
    const existing = [{ id: 'local-1', sourceUid: 'same' }]
    const plan = mergeIcsImport(existing, file.tasks)
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toInsert).toHaveLength(0)
  })
})
