/**
 * 批量粘贴：一次贴进多段通知，切成多段分别解析。
 *
 * 切分依据（按优先级）：
 * 1. 单独一行的 `---`（Markdown 分隔线习惯）
 * 2. 空行（聊天记录里最常见的分隔）
 * 3. 时间戳行：`2026-11-08 10:23` / `[2026-11-08 10:23]` / `2026-11-08 10:23 张三：`
 *    聊天记录导出时每段前面常带这种行；只把时间戳本身当分隔，后面的正文留在新段里。
 *
 * 去重：归一化空白后，标题 + 时间 + 二选一分组 都相同视为重复；保留第一次出现的，后续记入 duplicates。
 * 「本周日」双候选的标题与时间相同但 choiceGroup 不同，因此不会被误合并。
 */
import type { ParsedTask } from './types.js'
import { parseNotice } from './ruleParser.js'

export interface BatchSection {
  /** 该段的原文（保留，用于展示与核对） */
  raw: string
  /** 在整段输入里的顺序，从 0 开始 */
  index: number
}

const SEPARATOR_LINE = /^\s*-{3,}\s*$/
/** 带日期的聊天时间戳行：2026-11-08 10:23 / [2026-11-08 10:23] */
const DATED_TIMESTAMP_LINE =
  /^\s*\[?(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?\s+(\d{1,2}):(\d{2})(?::\d{2})?\]?\s*(.*)$/
/** 只有时间的方括号行：[10:23]（聊天记录常见），必须带方括号，避免把正文里的「23:59」当分隔 */
const BRACKET_TIME_LINE = /^\s*\[(\d{1,2}):(\d{2})(?::\d{2})?\]\s*(.*)$/

/** 时间戳行里可能带发送人（「张三：」），去掉后再当正文 */
function stripSender(text: string): string {
  return text.replace(/^[^\s：:]{1,12}[：:]\s*/, '').trim()
}

function timestampPayload(line: string): string | null {
  const dated = DATED_TIMESTAMP_LINE.exec(line)
  if (dated) return stripSender(dated[6] ?? '')
  const bracketed = BRACKET_TIME_LINE.exec(line)
  if (bracketed) return stripSender(bracketed[3] ?? '')
  return null
}

/**
 * 切分优先级（测试员口径）：时间戳行 > `---` > 空行。
 * - 存在合法时间戳行时**只按时间戳切**，正文里的空行与 `---` 不切
 * - 没有时间戳才按 `---` 切，再没有才按空行切
 */
export function splitNoticeSections(raw: string): BatchSection[] {
  const lines = raw.split(/\r?\n/)
  const hasTimestamp = lines.some((line) => timestampPayload(line) !== null)
  const hasSeparator = lines.some((line) => SEPARATOR_LINE.test(line))

  const mode: 'timestamp' | 'separator' | 'blank' = hasTimestamp
    ? 'timestamp'
    : hasSeparator
      ? 'separator'
      : 'blank'

  const sections: string[] = []
  let current: string[] = []

  const flush = () => {
    const text = current.join('\n').trim()
    if (text) sections.push(text)
    current = []
  }

  for (const line of lines) {
    if (mode === 'timestamp') {
      const payload = timestampPayload(line)
      if (payload !== null) {
        flush()
        if (payload) current.push(payload)
        continue
      }
      current.push(line)
      continue
    }
    if (mode === 'separator' && SEPARATOR_LINE.test(line)) {
      flush()
      continue
    }
    if (mode === 'blank' && line.trim() === '') {
      flush()
      continue
    }
    current.push(line)
  }
  flush()

  return sections
    .filter((text) => text.replace(/\s/g, '').length >= 4)
    .map((text, index) => ({ raw: text, index }))
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, '').toLowerCase()
}

export interface DedupeResult {
  kept: ParsedTask[]
  duplicates: ParsedTask[]
}

/** 批内去重：归一化空白 + 同标题 + 同时间 + 同二选一分组 */
export function dedupeParsedTasks(tasks: readonly ParsedTask[]): DedupeResult {
  const seen = new Set<string>()
  const kept: ParsedTask[] = []
  const duplicates: ParsedTask[] = []

  for (const task of tasks) {
    const key = [
      normalizeTitle(task.title),
      task.dueAt ?? '',
      task.startAt ?? '',
      task.choiceGroup ?? '',
      // 同一组里的两个候选（本周/下周）标题与时间相同，靠标签区分，不能合并
      task.choiceLabel ?? '',
    ].join('|')
    if (seen.has(key)) {
      duplicates.push(task)
      continue
    }
    seen.add(key)
    kept.push(task)
  }

  return { kept, duplicates }
}

export interface BatchParseResult {
  sections: number
  tasks: ParsedTask[]
  duplicates: ParsedTask[]
  warnings: string[]
}

/** 一次粘贴多段 → 全部候选（已去重） */
export function parseNoticeBatch(raw: string, ref: Date = new Date()): BatchParseResult {
  const sections = splitNoticeSections(raw)
  const warnings: string[] = []
  const all: ParsedTask[] = []

  sections.forEach((section) => {
    const result = parseNotice(section.raw, ref)
    warnings.push(...result.warnings.map((warning) => `第 ${section.index + 1} 段：${warning}`))
    // 跨段 id 可能撞车（同文本 + 同段内序号），加段前缀保证唯一
    for (const task of result.tasks) {
      all.push({ ...task, id: `s${section.index}_${task.id}` })
    }
  })

  const { kept, duplicates } = dedupeParsedTasks(all)

  if (sections.length === 0) warnings.push('没有识别到可解析的段落')
  if (duplicates.length > 0) warnings.push(`有 ${duplicates.length} 条重复内容已合并`)

  return { sections: sections.length, tasks: kept, duplicates, warnings }
}
