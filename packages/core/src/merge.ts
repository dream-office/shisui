/**
 * 双引擎合并：规则引擎负责「稳」，大模型负责「全」。
 * 合并策略必须保守 —— 宁可保留规则结果让人确认，也不能让模型把已确定的时间改错。
 */
import type { Confidence, ParsedTask } from './types.js'

const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

function dayKey(ms: number | null): string {
  if (ms === null) return 'none'
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function higher(a: Confidence, b: Confidence): Confidence {
  return CONF_RANK[a] >= CONF_RANK[b] ? a : b
}

export interface MergeReport {
  tasks: ParsedTask[]
  /** 规则引擎命中的条数 */
  ruleCount: number
  /** 大模型命中的条数 */
  llmCount: number
  /** 两引擎都对上的条数 */
  agreedCount: number
  /** 只有大模型发现的条数 */
  llmOnlyCount: number
}

/**
 * 合并规则：
 *  1. 同一天 + 同一类型 → 视为同一件事，取两边更完整的信息，置信度取高者；
 *  2. 规则引擎命中的时间优先保留（规则的时间换算过程可解释、可复现）；
 *  3. 大模型独有的条目追加，但置信度封顶为 medium —— 无法解释的结论不能算高置信。
 */
function titleBigrams(title: string): Set<string> {
  const chars = title.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
  const grams = new Set<string>()
  for (let i = 0; i < chars.length - 1; i += 1) grams.add(chars.slice(i, i + 2))
  return grams
}

/** 标题高度重叠（包含 / 2-gram 覆盖率 ≥ 0.6） */
function titleSimilar(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b || a.includes(b) || b.includes(a)) return true
  const ga = titleBigrams(a)
  const gb = titleBigrams(b)
  if (!ga.size || !gb.size) return false
  let shared = 0
  for (const gram of ga) if (gb.has(gram)) shared += 1
  return shared / Math.min(ga.size, gb.size) >= 0.8
}

function isUrlLike(value: string | null): boolean {
  if (!value) return false
  return /https?:\/\/|www\./i.test(value)
}

export function mergeTasks(ruleTasks: ParsedTask[], llmTasks: ParsedTask[]): MergeReport {
  const used = new Set<string>()
  const merged: ParsedTask[] = []
  let agreedCount = 0

  for (const ruleTask of ruleTasks) {
    const match = llmTasks.find(
      (llm) =>
        !used.has(llm.id) &&
        llm.kind === ruleTask.kind &&
        dayKey(llm.dueAt ?? llm.startAt) === dayKey(ruleTask.dueAt ?? ruleTask.startAt) &&
        titleSimilar(llm.title, ruleTask.title),
    )

    if (!match) {
      merged.push(ruleTask)
      continue
    }

    used.add(match.id)
    agreedCount += 1
    merged.push({
      ...ruleTask,
      title: ruleTask.title.length >= 4 ? ruleTask.title : match.title,
      channel: isUrlLike(ruleTask.channel) ? match.channel : (ruleTask.channel ?? match.channel),
      location: isUrlLike(ruleTask.location) ? match.location : (ruleTask.location ?? match.location),
      dueAt: ruleTask.dueAt ?? match.dueAt,
      startAt: ruleTask.startAt ?? match.startAt,
      confidence: higher(ruleTask.confidence, match.confidence),
      reasons: [...ruleTask.reasons, 'AI 也识别到这一条，双引擎一致'],
      engine: 'hybrid',
    })
  }

  const llmOnly = llmTasks.filter((t) => !used.has(t.id))
  for (const task of llmOnly) {
    const due = task.dueAt ?? task.startAt
    const existing = merged.find(
      (item) =>
        item.kind === task.kind &&
        dayKey(item.dueAt ?? item.startAt) === dayKey(due) &&
        titleSimilar(item.title, task.title),
    )
    if (existing) {
      existing.channel = existing.channel ?? (isUrlLike(task.channel) ? null : task.channel)
      existing.location = existing.location ?? (isUrlLike(task.location) ? null : task.location)
      existing.url = existing.url ?? (/^https?:\/\//i.test(task.url ?? '') ? task.url : null)
      existing.note = existing.note ?? task.note ?? null
      for (const reason of task.reasons) {
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
      }
      continue
    }
    merged.push({
      ...task,
      channel: isUrlLike(task.channel) ? null : task.channel,
      location: isUrlLike(task.location) ? null : task.location,
      confidence: CONF_RANK[task.confidence] > CONF_RANK.medium ? 'medium' : task.confidence,
      reasons: [...task.reasons, '规则引擎未命中，来自 AI 补充，请重点核对'],
    })
  }

  return {
    tasks: merged.sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER)),
    ruleCount: ruleTasks.length,
    llmCount: llmTasks.length,
    agreedCount,
    llmOnlyCount: llmOnly.length,
  }
}
