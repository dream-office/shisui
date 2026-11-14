
import { describe, expect, it } from 'vitest'
import { buildStatsCsv, renderStatsPng } from './statsExport'
import { CHART_PALETTE } from './chartPalette'
import type { Stats } from 'shisui-core'

const stats: Stats = {
  weekStart: 0, weekEnd: 0, weekTotal: 0, doneThisWeek: 0, completion: 50,
  parsedTotal: 0, edited: 0, editRate: null, total: 3, open: 1, skipped: 1,
  doneTotal: 1, doneWithTime: 1, lateDone: 1, lateRate: 100, overdue: 0,
  overdueBuckets: [], conflicts: { overlap: 0, overdue: 0, clash: 0, pileup: 0, total: 0 },
}

describe('v1.6 stats CSV', () => {
  it('含摘要/趋势/类型/专注，且带 BOM', () => {
    const csv = buildStatsCsv({
      stats,
      trend: [{ weekStart: 0, weekEnd: 1, total: 2, done: 1, rate: 50 }],
      kinds: [{ kind: 'task', count: 2 }],
      focus: [{ dayStart: 0, totalMs: 90_000, sessions: 2 }],
      kindLabel: () => 'Task / deliverable',
      lang: 'en',
    })
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('late completion (%)')
    expect(csv).toContain('Task / deliverable')
    expect(csv).toContain('focus minutes')
    expect(csv.split('\r\n').length).toBeGreaterThan(10)
  })
})

describe('v2.2 stats PNG palette', () => {
  it('三组图表都落到金色板（accent/dark/warn）', () => {
    const fills: string[] = []
    let current = ''
    const ctx = new Proxy({}, {
      get: (_target, prop) => {
        if (prop === 'fillStyle') return current
        return () => undefined
      },
      set: (_target, prop, value) => {
        if (prop === 'fillStyle') {
          current = String(value)
          fills.push(current)
        }
        return true
      },
    }) as unknown as CanvasRenderingContext2D
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
    renderStatsPng(canvas, {
      stats,
      trend: [{ weekStart: 0, weekEnd: 1, total: 2, done: 1, rate: 50 }],
      kinds: [{ kind: 'task', count: 2 }],
      focus: [{ dayStart: 0, totalMs: 90_000, sessions: 2 }],
      kindLabel: () => '任务',
      lang: 'zh',
    })
    expect(fills).toContain(CHART_PALETTE.accent)
    expect(fills).toContain(CHART_PALETTE.dark)
    expect(fills).toContain(CHART_PALETTE.warn)
  })
})
