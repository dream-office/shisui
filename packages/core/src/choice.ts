/**
 * 二选一分组（「本周日」当天的本周/下周）：选择逻辑抽成纯函数，便于单测。
 * UI 侧只负责把选中的 id 渲染出来，互斥规则在这里保证。
 */
import type { ParsedTask } from './types.js'

/** 二选一标签：用用户能直接看懂的说法，不靠展开 reasons 才能理解 */
export const CHOICE_THIS_WEEK = '本周（今天）'
export const CHOICE_NEXT_WEEK = '下周（7 天后）'

/** 默认选中：普通任务全选；每个二选一组只选「本周」（没有本周就选第一个） */
export function defaultChoiceSelection(tasks: readonly ParsedTask[]): string[] {
  const selected: string[] = []
  const groupSeen = new Set<string>()
  for (const task of tasks) {
    if (!task.choiceGroup) {
      selected.push(task.id)
      continue
    }
    if (groupSeen.has(task.choiceGroup)) continue
    const inGroup = tasks.filter((item) => item.choiceGroup === task.choiceGroup)
    const preferred =
      inGroup.find((item) => item.choiceLabel === CHOICE_THIS_WEEK || item.choiceLabel === '本周') ?? inGroup[0]
    selected.push(preferred.id)
    groupSeen.add(task.choiceGroup)
  }
  return selected
}

/** 勾选/取消：勾选某个二选一候选时，自动取消同组其它候选 */
export function toggleChoiceSelection(
  selected: readonly string[],
  target: ParsedTask,
  tasks: readonly ParsedTask[],
): string[] {
  const next = new Set(selected)
  if (next.has(target.id)) {
    next.delete(target.id)
    return [...next]
  }
  if (target.choiceGroup) {
    for (const task of tasks) {
      if (task.choiceGroup === target.choiceGroup) next.delete(task.id)
    }
  }
  next.add(target.id)
  return [...next]
}
