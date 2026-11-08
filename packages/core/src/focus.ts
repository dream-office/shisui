/**
 * 专注模式队列：未完成、未跳过；按主时刻最近优先，其次 createdAt（早的在前）。
 * UI 与 store 共用同一个纯函数，避免两套排序导致「显示 A、完成 B」。
 */
export interface FocusCandidate {
  done?: boolean
  skipped?: boolean
  startAt?: number | null
  dueAt?: number | null
  createdAt?: number
  id?: string
}

export function sortFocusQueue<T extends FocusCandidate>(tasks: readonly T[]): T[] {
  return tasks
    .filter((task) => task.done !== true && task.skipped !== true)
    .slice()
    .sort(
      (a, b) =>
        (a.startAt ?? a.dueAt ?? Infinity) - (b.startAt ?? b.dueAt ?? Infinity) ||
        (a.createdAt ?? 0) - (b.createdAt ?? 0),
    )
}
