/**
 * 规则解析引擎：把一段群消息切成「一条条可执行的事」，并给出可解释的置信度。
 * ---------------------------------------------------------------------------
 * 为什么不直接丢给大模型？
 *  1. 这是读者「一键复现」的第一道门槛：没配 API Key 也必须完整可用；
 *  2. 通知里 70% 的信息是高度模式化的（交什么、交到哪、什么时候前），规则比大模型更稳；
 *  3. 规则引擎的每条判断都能说明理由，大模型的判断不能——可解释性是可复现性的一部分。
 * 大模型作为「增强引擎」叠加在上面（core/llm.ts），两者结果合并后取高置信度者。
 */
import type { Confidence, ParsedTask, TaskKind } from './types'
import { extractTime } from './time'

const KIND_RULES: Array<{ kind: TaskKind; label: string; re: RegExp }> = [
  { kind: 'exam', label: '考试/答辩', re: /(考试|测验|小测|期中|期末|补考|随堂测|答辩)/ },
  { kind: 'homework', label: '作业/报告', re: /(作业|实验报告|课程报告|课设|课程设计|大作业|论文|习题|练习|实习报告|PPT)/i },
  { kind: 'meeting', label: '会议/活动', re: /(班会|开会|会议|讲座|宣讲|例会|座谈|动员|分享会|沙龙)/ },
  { kind: 'signup', label: '报名/选课', re: /(报名|抢课|选课|登记|预约|招募|招新|报名表)/ },
  { kind: 'payment', label: '缴费/报销', re: /(缴费|交费|缴纳|报销|费用|学费|住宿费)/ },
  { kind: 'survey', label: '问卷/填表', re: /(问卷|填表|打卡|调查|收集表|问卷星|腾讯问卷|接龙)/ },
]

const CHANNEL_RULES: Array<{ name: string; re: RegExp }> = [
  { name: '学习通', re: /(学习通|超星)/ },
  { name: '雨课堂', re: /雨课堂/ },
  { name: '智慧树', re: /(智慧树|知到)/ },
  { name: '教务系统', re: /(教务系统|教务处|正方)/ },
  { name: '邮箱', re: /(邮箱|邮件|email|E-mail|@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i },
  { name: '腾讯会议', re: /(腾讯会议|会议号)/ },
  { name: '钉钉', re: /钉钉/ },
  { name: '企业微信', re: /企业微信/ },
  { name: '微信群', re: /(微信群|群里|群公告|接龙)/ },
  { name: '纸质/线下', re: /(纸质|手写|打印|交到|办公室|实验室)/ },
]

const LOCATION_RE =
  /((?:[东西南中北]?[一二三四五六七八九十\d]*教(?:学楼)?|[A-Za-z]?\d{1,3}\s*号楼|实验楼|图书馆|体育馆)\s*[A-Za-z]?\s*\d{2,4}|[A-Za-z]?\d{1,2}\s*[-－]\s*\d{2,4})/

/** 标题前面那些没有信息量的连接语，逐轮剥掉 */
const LEADING_NOISE = [
  /^(?:请|请注意|注意|大家|同学们?|各位|各位同学|记得|务必|要求|通知|提醒|另外|还有|以及|并且|同时|如|如果|如下|友情提示|特别提醒|紧急|重要)+/,
  /^【[^】]{0,20}】/,
  /^\[[^\]]{0,20}\]/,
  /^关于/,
  /^[：:，,\s、-]+/,
  /^[①-⑳]/,
]

const NEGATIVE_RE = /(已经截止|已结束|不再|取消|作废)/

function cleanTitle(text: string): string {
  let out = text
  for (let i = 0; i < 4; i += 1) {
    const before = out
    for (const re of LEADING_NOISE) out = out.replace(re, '')
    out = out.replace(/^[：:，,\s、-]+/, '')
    if (out === before) break
  }
  return out.replace(/[，,、；;\s]+$/, '').replace(/\s{2,}/g, ' ').trim()
}

/** 把整段通知切成候选句：按换行 → 句号分号 → 编号列表 */
export function splitSegments(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[。；;！!？?]/))
    .flatMap((line) => line.split(/(?=\d{1,2}\s*[、.．)）]\s*)/))
    .flatMap((line) => line.split(/(?=[①-⑳])/))
    .map((s) => s.trim())
    .filter((s) => s.replace(/\s/g, '').length >= 4)
}

/** 稳定 id：同样输入永远得到同样 id，便于复现与去重 */
function stableId(text: string, index: number): string {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  return `t_${(hash >>> 0).toString(36)}_${index}`
}

function detectKind(text: string): { kind: TaskKind; label?: string } {
  for (const rule of KIND_RULES) {
    if (rule.re.test(text)) return { kind: rule.kind, label: rule.label }
  }
  return { kind: 'other' }
}

function detectChannel(text: string): string | null {
  for (const rule of CHANNEL_RULES) {
    if (rule.re.test(text)) return rule.name
  }
  return null
}

/** 解析一条候选句 */
export function parseSegment(segment: string, ref: Date, index: number): ParsedTask | null {
  const reasons: string[] = []
  if (NEGATIVE_RE.test(segment)) return null

  const hit = extractTime(segment, ref)
  const { kind, label } = detectKind(segment)
  if (label) reasons.push(`命中「${label}」关键词`)

  // 既没有时间、也不是任何已知事项类型 → 这是通知里的寒暄/落款，不是待办
  if (!hit && kind === 'other') return null

  const hasDeadlineWord = hit?.isDeadline ?? false
  // 光有一个日期（「今天天气不错」），既不是已知类型、也没有截止语义、还没到点 → 不是待办
  if (kind === 'other' && !hasDeadlineWord && !hit?.hasClock) return null

  let title = segment
  if (hit) {
    title = segment.slice(0, hit.start) + ' ' + segment.slice(hit.end)
    reasons.push(`时间短语「${hit.matched}」`)
  }
  title = cleanTitle(title)
  if (!title) title = cleanTitle(segment).slice(0, 28)

  const channel = detectChannel(segment)
  if (channel) reasons.push(`提交渠道：${channel}`)

  const locationMatch = LOCATION_RE.exec(segment)
  const location = locationMatch ? locationMatch[0].replace(/\s+/g, '') : null
  if (location) reasons.push(`地点：${location}`)

  const isDeadline = hit?.isDeadline ?? false
  if (isDeadline) reasons.push('含截止语义（前 / 之前 / 截止）')

  // 截止类事项默认 23:59，事件类默认 09:00 —— 人来定，但先给个合理值
  const startAt = hit?.hasClock ? (hit.atMs ?? null) : null
  const dueAt = hit ? (hit.hasClock ? hit.atMs : hit.dateMs + 23 * 3600_000 + 59 * 60_000) : null

  const confidence = scoreConfidence({ hit, kind, title, isDeadline })
  reasons.push(
    confidence === 'high'
      ? '时间与类型都明确'
      : confidence === 'medium'
        ? '结构基本清楚，建议顺手核对'
        : '信息不足或有歧义，请务必人工确认',
  )

  return {
    id: stableId(segment, index),
    title,
    dueAt,
    startAt: isDeadline ? null : startAt,
    kind,
    channel,
    location,
    rawText: segment,
    confidence,
    reasons,
    engine: 'rule',
  }
}

function scoreConfidence(input: {
  hit: ReturnType<typeof extractTime>
  kind: TaskKind
  title: string
  isDeadline: boolean
}): Confidence {
  const { hit, kind, title, isDeadline } = input
  if (!hit) return 'low'
  if (hit.ambiguous) return 'low'
  const titleOk = title.length >= 4
  if (hit.hasClock && titleOk && (kind !== 'other' || isDeadline)) return 'high'
  if (titleOk && (hit.hasClock || isDeadline || kind !== 'other')) return 'medium'
  return 'low'
}

export interface ParseResult {
  tasks: ParsedTask[]
  warnings: string[]
}

/** 一段通知 → 一组待办 */
export function parseNotice(raw: string, ref: Date = new Date()): ParseResult {
  const segments = splitSegments(raw)
  const tasks: ParsedTask[] = []
  const warnings: string[] = []

  segments.forEach((segment, index) => {
    const task = parseSegment(segment, ref, index)
    if (task) tasks.push(task)
  })

  if (segments.length === 0) warnings.push('这段文本太短，没找到可解析的内容')
  else if (tasks.length === 0) warnings.push('识别到文字，但没找到带时间的待办事项')
  if (tasks.some((t) => t.confidence === 'low')) warnings.push('有低置信度条目，已高亮标出，请人工核对')

  return { tasks, warnings }
}
