/**
 * 月历网格：纯函数，零依赖，不 import React。
 *
 * 固定 6 周 × 7 天 = 42 格（月历的常规做法：避免月份切换时格子数量跳动）。
 * 用**日历日算术**（setDate）逐格推进，而不是 `+86_400_000ms`：
 * 后者在夏令时切换日会少/多一小时，导致格子重复或跳过某天。
 */
export const MONTH_GRID_WEEKS = 6
export const MONTH_GRID_CELLS = MONTH_GRID_WEEKS * 7

/**
 * 生成包含 anchor 所在月份的 42 个日期（本地时间 00:00 的 epoch ms）。
 * 每周从周一开始。
 */
export function buildMonthGrid(anchor: Date): number[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0)
  const mondayBasedOffset = (first.getDay() + 6) % 7

  const cursor = new Date(first)
  cursor.setDate(first.getDate() - mondayBasedOffset)

  const cells: number[] = []
  for (let i = 0; i < MONTH_GRID_CELLS; i += 1) {
    cells.push(cursor.getTime())
    cursor.setDate(cursor.getDate() + 1)
  }
  return cells
}
