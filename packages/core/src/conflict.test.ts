import { describe, it, expect } from 'vitest'
import { scanConflicts, weeklyLoad } from './conflict.js'
import { countdown, formatDayLabel, formatWhen } from './format.js'

const REF = new Date(2026, 10, 4, 22, 7, 0) // 2026-11-04 周三 22:07
const at = (m: number, d: number, h: number, min: number) => new Date(2026, m - 1, d, h, min).getTime()

const task = (id: string, title: string, dueAt: number | null, startAt: number | null = null) => ({
  id,
  title,
  dueAt,
  startAt,
  kind: 'other' as const,
})

describe('scanConflicts 冲突体检', () => {
  it('识别已过期的事项', () => {
    const notes = scanConflicts([task('a', '交实验报告', at(11, 3, 23, 59))], REF)
    expect(notes).toHaveLength(1)
    expect(notes[0].level).toBe('danger')
    expect(notes[0].taskIds).toEqual(['a'])
  })

  it('两件事相差不到 2 小时会提示撞车', () => {
    const notes = scanConflicts(
      [task('a', '交作业A', at(11, 6, 22, 0)), task('b', '交作业B', at(11, 6, 23, 30))],
      REF,
    )
    expect(notes.some((n) => n.id.startsWith('clash_'))).toBe(true)
  })

  it('同一天堆 3 件以上会提示', () => {
    const notes = scanConflicts(
      [
        task('a', 'A', at(11, 10, 9, 0)),
        task('b', 'B', at(11, 10, 14, 0)),
        task('c', 'C', at(11, 10, 20, 0)),
      ],
      REF,
    )
    expect(notes.some((n) => n.id.startsWith('pileup_'))).toBe(true)
  })

  it('时间宽裕时没有告警', () => {
    expect(scanConflicts([task('a', '交作业', at(11, 20, 23, 59))], REF)).toHaveLength(0)
  })

  it('7 天压力分布按天分桶', () => {
    const load = weeklyLoad([task('a', 'A', at(11, 4, 23, 0)), task('b', 'B', at(11, 6, 23, 0))], REF)
    expect(load).toHaveLength(7)
    expect(load[0]).toBe(1)
    expect(load[2]).toBe(1)
  })
})

describe('countdown 倒计时', () => {
  it('12 小时内是红色', () => {
    expect(countdown(at(11, 5, 8, 0), REF).tone).toBe('danger')
  })
  it('48 小时内是黄色', () => {
    expect(countdown(at(11, 6, 20, 0), REF).tone).toBe('warn')
  })
  it('时间还早是常态色', () => {
    expect(countdown(at(11, 20, 20, 0), REF).tone).toBe('normal')
  })
  it('已过期单独一档', () => {
    const c = countdown(at(11, 3, 12, 0), REF)
    expect(c.tone).toBe('overdue')
    expect(c.text).toContain('已过期')
  })
})

describe('人话时间渲染', () => {
  it('今天 / 明天 / 后天', () => {
    expect(formatDayLabel(at(11, 4, 20, 0), REF)).toBe('今天')
    expect(formatDayLabel(at(11, 5, 20, 0), REF)).toBe('明天')
    expect(formatDayLabel(at(11, 6, 20, 0), REF)).toBe('后天')
  })
  it('一周内用星期表示', () => {
    expect(formatDayLabel(at(11, 9, 10, 0), REF)).toBe('周一')
  })
  it('更远的日期用月日', () => {
    expect(formatDayLabel(at(11, 18, 10, 0), REF)).toBe('11月18日')
  })
  it('完整时刻带点钟', () => {
    expect(formatWhen(at(11, 5, 20, 0), REF)).toBe('明天 20:00')
  })
})


describe('区间重叠（v0.8.0）', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m, 0, 0).getTime()
  const task = (id: string, start: number, end: number) => ({
    id,
    title: id,
    dueAt: null,
    startAt: start,
    endAt: end,
    kind: 'meeting' as const,
  })

  it('[9,11) 与 [10,12) 重叠 → danger', () => {
    const notes = scanConflicts([task('a', at(9), at(11)), task('b', at(10), at(12))], new Date(2026, 10, 20, 8))
    expect(notes.some((note) => note.title === '时间重叠' && note.level === 'danger')).toBe(true)
  })

  it('[9,10) 与 [10,11) 首尾相接 → 不算重叠', () => {
    const notes = scanConflicts([task('a', at(9), at(10)), task('b', at(10), at(11))], new Date(2026, 10, 20, 8))
    expect(notes.some((note) => note.title === '时间重叠')).toBe(false)
  })

  it('全天区间与当天定时事件重叠', () => {
    const allDayStart = new Date(2026, 10, 20, 0, 0, 0, 0).getTime()
    const allDayEnd = new Date(2026, 10, 21, 0, 0, 0, 0).getTime()
    const notes = scanConflicts(
      [
        { id: 'all', title: '全天', dueAt: null, startAt: allDayStart, endAt: allDayEnd, allDay: true, kind: 'task' as const },
        task('meet', at(10), at(11)),
      ],
      new Date(2026, 10, 20, 8),
    )
    expect(notes.some((note) => note.title === '时间重叠')).toBe(true)
  })
})
