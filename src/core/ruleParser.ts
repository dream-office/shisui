/**
 * 规则解析引擎：把一段群消息切成「一条条可执行的事」，并给出可解释的置信度。
 * ---------------------------------------------------------------------------
 * 为什么不直接丢给大模型？
 *  1. 这是「装完就能用」的第一道门槛：没配 API Key 也必须完整可用；
 *  2. 通知里 70% 的信息是高度模式化的（交什么、交到哪、什么时候前），规则比大模型更稳；
 *  3. 规则引擎的每条判断都能说明理由，大模型的判断不能——可解释性是可复现性的一部分。
 * 大模型作为「增强引擎」叠加在上面（core/llm.ts），两者结果合并后取高置信度者。
 */
import type { Confidence, ParsedTask, TaskKind } from './types'
import { extractTime } from './time'

/**
 * 类型判定：从「最具体」排到「最宽泛」，先命中先得。
 * 顺序很关键——「答辩」必须排在「PPT」前面，「评审」必须排在「文档」前面，
 * 否则一条「评审文档」会被识别成普通任务而不是评审。
 */
const KIND_RULES: Array<{ kind: TaskKind; label: string; re: RegExp }> = [
  { kind: 'exam', label: '考试/测验', re: /(考试|测验|小测|期中|期末|补考|随堂测)/ },
  { kind: 'review', label: '评审/验收', re: /(评审|验收|答辩|复核|code review|\breview\b)/i },
  { kind: 'approval', label: '审批/确认', re: /(审批|签批|签字|确认单|走流程|待批)/ },
  { kind: 'meeting', label: '会议/活动', re: /(班会|开会|会议|例会|周会|晨会|复盘会|讲座|宣讲|座谈|动员|分享会|沙龙|培训|面试)/ },
  {
    kind: 'task',
    label: '任务/交付',
    // 故意不含「文档」：它太泛，「链接在飞书文档」会把问卷抢成任务
    re: /(作业|实验报告|课程报告|课设|课程设计|大作业|论文|习题|练习|实习报告|周报|日报|月报|方案|初稿|总结|材料|报表|预算|清单|表格|PPT)/i,
  },
  { kind: 'signup', label: '报名/登记', re: /(报名|抢课|选课|登记|预约|招募|招新|报名表|接龙)/ },
  { kind: 'payment', label: '缴费/报销', re: /(缴费|交费|缴纳|报销|费用|学费|住宿费|发票|对账|打款)/ },
  { kind: 'survey', label: '问卷/填表', re: /(问卷|填表|打卡|调查|收集表|问卷星|腾讯问卷|投票)/ },
]

/**
 * 提交渠道：办公与校园并重。
 * 「群里说一声」不算渠道，能被指名的系统才算——否则「交给谁」在日程页上毫无信息量。
 */
const CHANNEL_RULES: Array<{ name: string; re: RegExp }> = [
  { name: '飞书', re: /(飞书|Feishu|Lark)/i },
  { name: '钉钉', re: /钉钉/ },
  { name: '企业微信', re: /企业微信/ },
  { name: 'OA/审批系统', re: /(\bOA\b|审批系统|财务系统|\bERP\b|用友|金蝶)/i },
  { name: 'Jira/Confluence', re: /(Jira|Confluence)/i },
  { name: '在线文档', re: /(腾讯文档|石墨|语雀|Notion|飞书文档|金山文档)/i },
  { name: '学习通', re: /(学习通|超星)/ },
  { name: '雨课堂', re: /雨课堂/ },
  { name: '智慧树', re: /(智慧树|知到)/ },
  { name: '教务系统', re: /(教务系统|教务处|正方)/ },
  { name: '邮箱', re: /(邮箱|邮件|email|E-mail|@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i },
  { name: '线上会议', re: /(腾讯会议|会议号|Zoom|Teams|飞书会议)/i },
  { name: '聊天群', re: /(微信群|群里|群公告|QQ群)/i },
  { name: '纸质/线下', re: /(纸质|手写|打印|交到|办公室|前台|实验室)/ },
]

const LOCATION_RE =
  /((?:[东西南中北]?[一二三四五六七八九十\d]*教(?:学楼)?|[A-Za-z]?\d{1,3}\s*号楼|实验楼|图书馆|体育馆|报告厅|会议室)\s*[A-Za-z]?\s*\d{0,4}|\d{1,2}\s*楼\s*(?:会议室|报告厅|\d{2,4})|[A-Za-z]?\d{1,2}\s*[-－]\s*\d{2,4})/

/** 标题前面那些没有信息量的连接语，逐轮剥掉 */
const LEADING_NOISE = [
  /^(?:请|请注意|注意|大家|同学们?|各位|各位同学|各位同事|同事们|各部门|亲们|记得|务必|要求|通知|提醒|麻烦|另外|还有|以及|并且|同时|如|如果|如下|友情提示|特别提醒|紧急|重要)+/,
  /^【[^】]{0,20}】/,
  /^\[[^\]]{0,20}\]/,
  /^\d{1,2}\s*[、.．)）]\s*/,
  /^关于/,
  /^[：:，,\s、-]+/,
  /^[①-⑳]/,
]

/**
 * 「整条通知作废」的措辞。
 * 注意不要写成光秃秃的「不再」——「逾期本季度不再受理」是催你按时交，
 * 不是取消这件事；把它当取消处理会直接吞掉一条真待办。
 */
const NEGATIVE_RE = /(已取消|已经截止|已结束|作废|不再举行|不再进行|通知取消)/

function cleanTitle(text: string): string {
  let out = text
  for (let i = 0; i < 4; i += 1) {
    const before = out
    for (const re of LEADING_NOISE) out = out.replace(re, '')
    out = out.replace(/^[：:，,\s、-]+/, '')
    if (out === before) break
  }
  return out
    .replace(/[，,、；;\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    // 中文之间不该留空格：时间短语被裁掉后中间会剩一个空格，
    // 「报销单请在 提交到 OA」删掉空格才像人话。中英文之间的空格保留。
    .replace(/(?<=[\u4e00-\u9fa5，。；：、])\s+(?=[\u4e00-\u9fa5])/g, '')
    .trim()
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
    // 时间短语后面常跟着「前 / 之前 / 以前」这类截止词，一并吃掉，
    // 否则标题里会留下一个孤零零的「前」
    const tail = segment.slice(hit.end)
    const tailDeadline = /^(之前|以前|前)/.exec(tail)
    const cutEnd = hit.end + (tailDeadline ? tailDeadline[0].length : 0)
    title = segment.slice(0, hit.start) + ' ' + segment.slice(cutEnd)
    reasons.push(`时间短语「${hit.matched}${tailDeadline ? tailDeadline[0] : ''}」`)
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
