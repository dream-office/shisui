import { describe, expect, it } from 'vitest'
import { MONTH_GRID_CELLS, buildMonthGrid } from './monthGrid.js'

function localDate(ms: number): { y: number; m: number; d: number } {
  const date = new Date(ms)
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
}

describe('buildMonthGrid', () => {
  it('固定 42 格（6 周）', () => {
    const grid = buildMonthGrid(new Date(2026, 10, 8))
    expect(MONTH_GRID_CELLS).toBe(42)
    expect(grid).toHaveLength(42)
  })

  it('每周从周一开始', () => {
    const grid = buildMonthGrid(new Date(2026, 10, 1))
    for (let i = 0; i < 7; i += 1) {
      expect(new Date(grid[i]).getDay()).toBe(i === 6 ? 0 : i + 1) // 周一..周日
    }
  })

  it('闰年 2028-02 包含 29 日', () => {
    const grid = buildMonthGrid(new Date(2028, 1, 1))
    const days = grid.map(localDate).filter((day) => day.y === 2028 && day.m === 2)
    expect(days.some((day) => day.d === 29)).toBe(true)
    expect(days).toHaveLength(29)
  })

  it('平年 2026-02 不含 29 日，且共 28 天', () => {
    const grid = buildMonthGrid(new Date(2026, 1, 1))
    const days = grid.map(localDate).filter((day) => day.y === 2026 && day.m === 2)
    expect(days.some((day) => day.d === 29)).toBe(false)
    expect(days).toHaveLength(28)
  })

  it('跨年：2026-12 的网格包含 2027 年 1 月', () => {
    const grid = buildMonthGrid(new Date(2026, 11, 15))
    const days = grid.map(localDate)
    expect(days.some((day) => day.y === 2027 && day.m === 1)).toBe(true)
  })

  it('跨月：2026-11 的网格同时包含 10 月末与 12 月初', () => {
    const grid = buildMonthGrid(new Date(2026, 10, 1))
    const days = grid.map(localDate)
    expect(days.some((day) => day.m === 10)).toBe(true)
    expect(days.some((day) => day.m === 12)).toBe(true)
  })

  it('月末不差一天：31 号那月最后一天正确落在格子里', () => {
    const grid = buildMonthGrid(new Date(2026, 7, 31)) // 2026-08-31
    const days = grid.map(localDate)
    expect(days.some((day) => day.y === 2026 && day.m === 8 && day.d === 31)).toBe(true)
    expect(days).not.toContainEqual({ y: 2026, m: 8, d: 32 })
  })

  it('相邻格子是连续的日历日（夏令时切换也不会跳/重）', () => {
    // 2026-03-08 是美国夏令时开始日；用 setDate 逐日推进时，
    // 本地日历日必须连续（若按 +86400000ms 推进，DST 时区会重复或跳过一天）
    const grid = buildMonthGrid(new Date(2026, 2, 8))
    for (let i = 1; i < grid.length; i += 1) {
      const previous = new Date(grid[i - 1])
      const current = new Date(grid[i])
      const expected = new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 1)
      expect(current.getFullYear()).toBe(expected.getFullYear())
      expect(current.getMonth()).toBe(expected.getMonth())
      expect(current.getDate()).toBe(expected.getDate())
    }
  })

  it('每格都是本地 00:00', () => {
    const grid = buildMonthGrid(new Date(2026, 10, 8))
    for (const cell of grid) {
      const date = new Date(cell)
      expect(date.getHours()).toBe(0)
      expect(date.getMinutes()).toBe(0)
      expect(date.getSeconds()).toBe(0)
      expect(date.getMilliseconds()).toBe(0)
    }
  })
})
