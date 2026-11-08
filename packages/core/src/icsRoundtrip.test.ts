import { describe, expect, it } from 'vitest'
import { importIcs } from './icsImport.js'
import { tasksToIcs, type IcsSeries } from './ics.js'
import { parseRRule } from './recurrence.js'

const REF = new Date(Date.UTC(2026, 10, 1, 0, 0, 0))

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0, 0, 0).getTime()

describe('ICS 往返：重复系列', () => {
  const series: IcsSeries = {
    id: 'series_1',
    rrule: 'FREQ=WEEKLY;BYDAY=FR;COUNT=5',
    startAt: at(2026, 11, 6, 9),
    endAt: null,
    allDay: false,
    title: '每周例会',
    channel: '腾讯会议',
    location: '3 楼',
  }

  it('一个系列只导出一次 RRULE；实例不重复导出', () => {
    const ics = tasksToIcs(
      [
        // 系列实例（不应被单独导出）
        { id: 'rec_0', title: '每周例会', startAt: at(2026, 11, 6, 9), dueAt: null, seriesId: 'series_1' },
        { id: 'rec_1', title: '每周例会', startAt: at(2026, 11, 13, 9), dueAt: null, seriesId: 'series_1' },
        // 普通任务
        { id: 'plain', title: '交报告', startAt: null, dueAt: at(2026, 11, 20, 18) },
      ],
      { ref: REF, series: [series] },
    )

    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2)
    expect((ics.match(/RRULE:/g) ?? []).length).toBe(1)
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=5')
    expect(ics).toContain('SUMMARY:交报告')
  })

  it('结束系列 → RRULE 带 UNTIL 截断（断言由实际 UTC 推导，不写死年份）', () => {
    const endedAt = at(2026, 12, 31, 23)
    const ics = tasksToIcs([], {
      ref: REF,
      series: [{ ...series, endedAt }],
    })

    // 由 endedAt 的真实 UTC 值推出 YYYYMMDD，避免时区把本地 23:00 推到次日
    const utcDate = new Date(endedAt).toISOString().slice(0, 10).replace(/-/g, '')
    expect(ics).toMatch(new RegExp(`RRULE:.*UNTIL=${utcDate}T\\d{6}Z`))

    // 语义断言（与 TZ 无关）：UNTIL 换算回本地仍是 2026-12-31 23:00
    const imported = importIcs(ics, { makeId: (i) => `imp_${i}` }).tasks[0]
    const rule = parseRRule(imported.rrule!)
    expect(rule?.until).not.toBeNull()
    const local = new Date(rule!.until!)
    expect(local.getFullYear()).toBe(2026)
    expect(local.getMonth()).toBe(11)
    expect(local.getDate()).toBe(31)
    expect(local.getHours()).toBe(23)
  })

  it('往返：导出 → 再导入，规则不丢、不展开成多条', () => {
    const ics = tasksToIcs([], { ref: REF, series: [series] })
    const result = importIcs(ics, { makeId: (i, uid) => `imp_${i}_${uid ?? 'x'}` })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].rrule).toContain('FREQ=WEEKLY')
    expect(result.tasks[0].rrule).toContain('BYDAY=FR')
    expect(result.tasks[0].rrule).toContain('COUNT=5')
  })
})

describe('ICS 往返：多日区间', () => {
  it('多日全天导出 DTSTART/DTEND=VALUE=DATE，再导入 endAt 对称', () => {
    const start = new Date(2026, 10, 20, 0, 0, 0, 0).getTime()
    const end = new Date(2026, 10, 23, 0, 0, 0, 0).getTime()
    const ics = tasksToIcs(
      [{ id: 'multi', title: '三天活动', startAt: start, dueAt: null, endAt: end, allDay: true }],
      { ref: REF },
    )
    expect(ics).toContain('DTSTART;VALUE=DATE:20261120')
    expect(ics).toContain('DTEND;VALUE=DATE:20261123')

    const back = importIcs(ics, { makeId: (i) => `imp_${i}` }).tasks[0]
    expect(back.startAt).toBe(start)
    expect(back.endAt).toBe(end)
    expect(back.allDay).toBe(true)
  })

  it('跨天会议导出 DTSTART/DTEND 时间并往返', () => {
    const start = new Date(2026, 10, 20, 22, 0, 0, 0).getTime()
    const end = new Date(2026, 10, 21, 1, 0, 0, 0).getTime()
    const ics = tasksToIcs([{ id: 'night', title: '跨天会议', startAt: start, dueAt: null, endAt: end }], { ref: REF })
    const back = importIcs(ics, { makeId: (i) => `imp_${i}` }).tasks[0]
    expect(back.startAt).toBe(start)
    expect(back.endAt).toBe(end)
  })

  it('三次往返不漂移', () => {
    const start = new Date(2026, 10, 20, 0, 0, 0, 0).getTime()
    const end = new Date(2026, 10, 23, 0, 0, 0, 0).getTime()
    let ics = tasksToIcs([{ id: 'multi', title: '三天活动', startAt: start, dueAt: null, endAt: end, allDay: true }], { ref: REF })
    for (let i = 0; i < 3; i += 1) {
      const task = importIcs(ics, { makeId: (n) => `imp_${i}_${n}` }).tasks[0]
      expect(task.startAt).toBe(start)
      expect(task.endAt).toBe(end)
      ics = tasksToIcs(
        [{ id: task.id, title: task.title, startAt: task.startAt, dueAt: null, endAt: task.endAt, allDay: task.allDay }],
        { ref: REF },
      )
    }
  })
})
