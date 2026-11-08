/**
 * 搜索与标签（纯函数，零 IO）：
 * - 普通关键词：标题 / 原文 / 地点 / 标签，全部按「包含」匹配（不区分大小写）
 * - `#tag`：只按标签精确匹配（去 # 后比较，标签本身不区分大小写）
 * - 多个词之间是「与」关系：`#作业 报告` = 标签含作业 且 标题/原文等含报告
 */
import type { ParsedTask } from './types.js'

export interface SearchQuery {
  /** 普通关键词（小写化） */
  terms: string[]
  /** #标签（小写化，去 #） */
  tags: string[]
  /** 原始输入 */
  raw: string
}

export interface Searchable extends Pick<ParsedTask, 'title'> {
  rawText?: string
  location?: string | null
  channel?: string | null
  tags?: string[]
}

/** 解析搜索输入：`#作业 报告` → { tags: ['作业'], terms: ['报告'] } */
export function parseQuery(input: string): SearchQuery {
  const raw = input.trim()
  const terms: string[] = []
  const tags: string[] = []
  for (const token of raw.split(/\s+/).filter(Boolean)) {
    if (token.startsWith('#')) {
      const tag = token.slice(1).trim().toLowerCase()
      if (tag) tags.push(tag)
    } else {
      terms.push(token.toLowerCase())
    }
  }
  return { terms, tags, raw }
}

/** 空查询视为匹配全部 */
export function isEmptyQuery(query: SearchQuery): boolean {
  return query.terms.length === 0 && query.tags.length === 0
}

/** 任务是否匹配查询（多个词之间是与关系） */
export function matchTask(task: Searchable, query: SearchQuery): boolean {
  const tags = (task.tags ?? []).map((tag) => tag.toLowerCase())
  for (const tag of query.tags) {
    if (!tags.includes(tag)) return false
  }
  if (query.terms.length === 0) return true

  const haystack = [task.title, task.rawText ?? '', task.location ?? '', task.channel ?? '', tags.join(' ')]
    .join('\n')
    .toLowerCase()
  return query.terms.every((term) => haystack.includes(term))
}

export function filterTasks<T extends Searchable>(tasks: readonly T[], input: string): T[] {
  const query = parseQuery(input)
  if (isEmptyQuery(query)) return [...tasks]
  return tasks.filter((task) => matchTask(task, query))
}

/** 规范化标签：去空白、去重（大小写不敏感）、去 # 前缀、限制长度 */
export function normalizeTags(input: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const tag = raw.trim().replace(/^#+/, '').trim().toLowerCase()
    if (!tag) continue
    const key = tag
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag.slice(0, 20))
  }
  return out
}

/** 增删标签（返回新数组，不改入参） */
export function toggleTag(tags: readonly string[], tag: string, add: boolean): string[] {
  const normalized = normalizeTags([tag])
  if (normalized.length === 0) return [...tags]
  const next = add ? [...tags, ...normalized] : tags.filter((item) => item.toLowerCase() !== normalized[0].toLowerCase())
  return normalizeTags(next)
}
