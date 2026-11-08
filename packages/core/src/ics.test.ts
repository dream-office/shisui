import { describe, expect, it } from 'vitest'
import { escapeIcsText, isAllDayTimestamp, tasksToIcs, type IcsTask } from './ics.js'

const REF = new Date(Date.UTC(2026, 10, 7, 12, 0, 0))

function task(partial: Partial<IcsTask> & { id: string; title: string }): IcsTask {
  return { dueAt: null, ...partial }
}

function eventBlock(ics: string): string {
  const start = ics.indexOf('BEGIN:VEVENT')
  const end = ics.indexOf('END:VEVENT')
  return ics.slice(start, end)
}

describe('tasksToIcs', () => {
  it('生成 VCALENDAR 骨架与固定 DTSTAMP', () => {
    const ics = tasksToIcs([task({ id: 't1', title: '交报告', dueAt: Date.UTC(2026, 10, 8, 2, 0) })], { ref: REF })

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('PRODID:-//dream-office//shisui//ZH')
    expect(ics).toContain('DTSTAMP:20261107T120000Z')
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    // ICS 必须用 CRLF
    expect(ics.includes('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false)
  })

  it('时间一律转成 UTC（不写 TZID）', () => {
    const due = Date.UTC(2026, 10, 8, 2, 30, 0)
    const ics = tasksToIcs([task({ id: 't1', title: '开会', dueAt: due })], { ref: REF })

    expect(ics).toContain('DTSTART:20261108T023000Z')
    expect(ics).not.toContain('TZID')
    expect(ics).not.toContain('VTIMEZONE')
  })

  it('只有截止时间：默认排 30 分钟', () => {
    const due = Date.UTC(2026, 10, 8, 2, 0, 0)
    const ics = tasksToIcs([task({ id: 't1', title: '截止', dueAt: due })], { ref: REF })
    expect(eventBlock(ics)).toContain('DTSTART:20261108T020000Z')
    expect(eventBlock(ics)).toContain('DTEND:20261108T023000Z')
  })

  it('有开始和截止：DTEND 用截止时间', () => {
    const ics = tasksToIcs(
      [
        task({
          id: 't1',
          title: '评审会',
          startAt: Date.UTC(2026, 10, 8, 1, 0, 0),
          dueAt: Date.UTC(2026, 10, 8, 3, 0, 0),
        }),
      ],
      { ref: REF },
    )
    const block = eventBlock(ics)
    expect(block).toContain('DTSTART:20261108T010000Z')
    expect(block).toContain('DTEND:20261108T030000Z')
  })

  it('本地时间 00:00:00 视为全天，DTEND 是次日（不含）', () => {
    // 用本地时间构造，跨时区也成立：本地 0 点 = 全天
    const midnight = new Date(2026, 10, 20, 0, 0, 0, 0).getTime()
    expect(isAllDayTimestamp(midnight)).toBe(true)

    const ics = tasksToIcs([task({ id: 't1', title: '全天任务', dueAt: midnight })], { ref: REF })
    expect(ics).toContain('DTSTART;VALUE=DATE:20261120')
    expect(ics).toContain('DTEND;VALUE=DATE:20261121')
  })

  it('非 0 点不算全天', () => {
    const notMidnight = new Date(2026, 10, 20, 9, 0, 0, 0).getTime()
    expect(isAllDayTimestamp(notMidnight)).toBe(false)
  })

  it('TEXT 转义：反斜杠、分号、逗号、换行', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')

    const ics = tasksToIcs(
      [task({ id: 't1', title: 'A, B; C\\D', dueAt: Date.UTC(2026, 10, 8, 2, 0) })],
      { ref: REF },
    )
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\\\D')
  })

  it('没有时间的任务被跳过', () => {
    const ics = tasksToIcs([task({ id: 't1', title: '没时间' })], { ref: REF })
    expect(ics).not.toContain('BEGIN:VEVENT')
  })

  it('已完成默认跳过，includeDone 时带上 STATUS:COMPLETED', () => {
    const done = task({ id: 't1', title: '已做完', dueAt: Date.UTC(2026, 10, 8, 2, 0), done: true })

    expect(tasksToIcs([done], { ref: REF })).not.toContain('BEGIN:VEVENT')

    const withDone = tasksToIcs([done], { ref: REF, includeDone: true })
    expect(withDone).toContain('BEGIN:VEVENT')
    expect(withDone).toContain('STATUS:COMPLETED')
  })

  it('UID 用 id@shisui，且按时间排序', () => {
    const ics = tasksToIcs(
      [
        task({ id: 'later', title: '晚', dueAt: Date.UTC(2026, 10, 9, 2, 0) }),
        task({ id: 'earlier', title: '早', dueAt: Date.UTC(2026, 10, 8, 2, 0) }),
      ],
      { ref: REF },
    )
    expect(ics).toContain('UID:earlier@shisui')
    expect(ics).toContain('UID:later@shisui')
    expect(ics.indexOf('UID:earlier')).toBeLessThan(ics.indexOf('UID:later'))
  })

  it('长中文标题按 75 字节折行，续行以空格开头', () => {
    const title = '请'.repeat(40) // 120 字节，必然超过 75
    const ics = tasksToIcs([task({ id: 't1', title, dueAt: Date.UTC(2026, 10, 8, 2, 0) })], { ref: REF })

    const encoder = new TextEncoder()
    const summaryLine = ics.split('\r\n').findIndex((line) => line.startsWith('SUMMARY:'))
    expect(summaryLine).toBeGreaterThan(-1)

    let index = summaryLine
    let total = ''
    while (true) {
      const line = ics.split('\r\n')[index]
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75)
      total += line.startsWith(' ') ? line.slice(1) : line
      const next = ics.split('\r\n')[index + 1]
      if (!next || !next.startsWith(' ')) break
      index += 1
    }
    expect(total).toBe(`SUMMARY:${title}`)
  })
})
