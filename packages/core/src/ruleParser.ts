/**
 * 规则解析引擎：把一段群消息切成「一条条可执行的事」，并给出可解释的置信度。
 * ---------------------------------------------------------------------------
 * 为什么不直接丢给大模型？
 *  1. 这是「装完就能用」的第一道门槛：没配 API Key 也必须完整可用；
 *  2. 通知里 70% 的信息是高度模式化的（交什么、交到哪、什么时候前），规则比大模型更稳；
 *  3. 规则引擎的每条判断都能说明理由，大模型的判断不能——可解释性是可复现性的一部分。
 * 大模型作为「增强引擎」叠加在上面（core/llm.ts），两者结果合并后取高置信度者。
 */
import type { Confidence, ParsedTask, TaskKind } from './types.js'
import { extractTime, setClock, startOfDay, type TimeHit } from './time.js'
import { CHOICE_NEXT_WEEK, CHOICE_THIS_WEEK } from './choice.js'
import {
  describeRule,
  looksRecurring,
  parseRecurrenceInput,
  ruleToRRule,
  stripRecurrencePhrase,
} from './recurrence.js'

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
    re: /(作业|实验报告|课程报告|课设|课程设计|大作业|论文|习题|练习|实习报告|周报|日报|月报|方案|初稿|总结|材料|报表|预算|清单|表格|PPT|统计|汇总|反馈|课程|网课|课堂)/i,
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

/**
 * 地点：既要认「教学楼A301」「3楼会议室」，也要避免把会议号 `123-456-789`
 * 里的 `23-456` 当房间号。所以数字区间两端都加边界断言。
 */
const LOCATION_RE =
  /((?:[东西南中北]?[一二三四五六七八九十\d]*教(?:学楼|室)|图书馆(?:报告厅)?|实验楼|体育馆|报告厅|会议室|食堂|操场|宿舍|行政楼|办公室|门口)\s*[A-Za-z]?\s*\d{0,4}|\d{1,2}\s*楼\s*(?:会议室|报告厅|\d{2,4})|(?<![\d-])[A-Za-z]?\d{1,2}\s*[-－]\s*\d{2,4}(?![\d-]))/

/** 「地点：食堂三楼」这类显式写法优先；网址、会议号不能当地点 */
const LOCATION_LABEL_RE = /地点[：:]\s*([^\s，。；;]{2,20})/
const URL_RE = /https?:\/\/\S+|www\.\S+/gi

/** 章节标题 / 纯说明段 / 无行动要求句：不产任务 */
const CHAPTER_RE = /^[一二三四五六七八九十百]+[、.．)）]\s*/
const ACTION_RE =
  /(提交|完成|统计|反馈|上交|交到|交付|发送|发到|填写|填报|上传|报名|缴费|交费|缴纳|确认|参加|学习|考试|复习|准备|整理|汇总|打印|领取|回复|接龙|预约|登记|汇报|讨论|开会|评审|验收|审核|签字|打卡|观看|下载|安装|注册|投票|作答|练习|报送|申报|办理|退还|归还|修改|更新|核对|查看|阅读|集合|出差|传到|转发|转交|抄送|交)/
const ROLE_LINE_RE =
  /^(?:学习委员|班长|团支书|课代表|组长|负责人|班委|各班委)[^。；]{0,16}?(?:负责|跟进|提醒|统计|汇总|组织|督促)/
const PLATFORM_LINE_RE = /^(?:(?:学习|考试|测评|线上|网络)(?:（[^）]{0,8}）)?)?(?:平台|网址|链接|入口|系统|网站)[：:]?/
const PLATFORM_ANY_RE = /(?:平台|网址|链接|入口)[：:]/
const SCHEDULE_LINE_RE =
  /^(?:(?:学习|考试|培训|活动|比赛|报名|填报|提交))?(?:时间|日期|时段)(?:安排|范围)?[：:]?/
const HEADING_LINE_RE = /^(?:学习|考试|工作|活动|会议|培训|报名)(?:要求|安排|内容|对象|范围|说明|方式)[：:]?$/
const STRONG_ACTION_RE = /(提交|上传|完成|统计|反馈|报名|作答|参加|缴费|打卡|填写|发送|转告|自查)/
  const FALLBACK_ACTION_RE = /(转告|自查|统计|反馈|提交|上报|完成|填写|报名|缴费|上传|发送|领取|确认|打印|汇总|整理|准备|参加|开会|评审|验收)/
  const ACTION_VERB_RE =
    /(转告|自查|统计|反馈|提交|上报|完成|填写|报名|缴费|上传|发送|领取|打印|汇总|整理|准备|参加|开会|评审|验收|确认|交到|交付|发到)/

/** 标题前面那些没有信息量的连接语，逐轮剥掉 */
const LEADING_NOISE = [
  // 「如果」「如下」「若」必须排在裸「如」前面，否则「如果本周五…」会被剥成「果本周五…」
  /^(?:请|请注意|注意|大家|同学们?|各位|各位同学|各位同事|同事们|各部门|亲们|记得|务必|要求|通知|提醒|麻烦|另外|还有|以及|并且|同时|如果|如下|若|如|友情提示|特别提醒|紧急|重要)+/,
  /^【[^】]{0,20}】/,
  /^\[[^\]]{0,20}\]/,
  /^\d{1,2}\s*[、.．)）]\s*/,
  /^[一二三四五六七八九十百]+[、.．)）]\s*/,
  /^(?:各班|各班级|各单位|各院系|全校|全体)\s*/,
  /^同学们?\s*/,
  /^关于/,
  /^[：:，,\s、-]+/,
  /^[①-⑳]/,
]

/**
 * 「整条通知作废」的措辞。
 * 注意不要写成光秃秃的「不再」——「逾期本季度不再受理」是催你按时交，
 * 不是取消这件事；把它当取消处理会直接吞掉一条真待办。
 * 但裸「取消」和「已截止」必须认，否则取消通知会被当成新待办。
 */
const NEGATIVE_RE = /(已取消|取消|已经截止|已截止|已结束|作废|不再举行|不再进行|通知取消)/

/**
 * 时间短语前后的虚词：一起吃掉，否则标题会留下「于」「前」「在」。
 * 只认显式说法，不放裸「于 / 在」——「关于11月18日」的「于」属于「关于」，
 * 「会议时间定在11月18日」的「在」属于「定在」，裸匹配会把它们削成「关」「定」。
 */
const BEFORE_TIME_RE =
  /(?:截止日期为|截止日期是|截止时间是|截止时间为|截止时间在|截止到|截至|日期为|日期是|时间为|时间是|会议时间[：:]|时间[：:]|决定于|安排在|定于|定在|将于|将在|改在|放在|设在|约在|并在|请于|请在|(?<!关)于|(?<![现存正实])在)\s*$/
/**
 * 时间短语后面跟着的截止词或星期注记（「前」「之前」「（周三）」），可能连着出现，最多吃三轮。
 * 「前」加否定后顾，只挡真正的词：「前台/前往/前后/前夕/年前/期限/前提是」，
 * 不能一刀切挡「提」——「11月20日前提交」的「前」必须吃掉。
 */
const AFTER_TIME_RE =
  /^\s*(?:之前|以前|前(?!台|往|后|夕|年|期|提是)|[（(]\s*(?:周|星期)[一二三四五六日天]\s*[）)])/

/**
 * 只删时间短语本身，不删它前后的正文。
 * 早期实现是「从日期起点切到钟点终点」，当日期和钟点隔得远时
 * （「11月18日之前把预算表发到财务邮箱，并在下午3点前确认」）会把中间整段正文删掉。
 */
function stripTimePhrases(segment: string, hit: TimeHit): string {
  const ranges: Array<[number, number]> = []
  if (hit.dateEnd > hit.dateStart) {
    ranges.push(expandRange(segment, hit.dateStart, hit.dateEnd))
  }
  if (hit.clockStart !== null && hit.clockEnd !== null) {
    ranges.push(expandRange(segment, hit.clockStart, hit.clockEnd))
  }
  // 时段词单独作为一段：它可能和钟点隔着字（「上午会议9点」），
  // 并进去会把「会议」一起删掉。这里也做一次前置虚词扩展，
  // 否则「并在下午3点前确认」会留下「在确认」。
  if (hit.periodStart !== null && hit.periodEnd !== null) {
    ranges.push(expandRange(segment, hit.periodStart, hit.periodEnd))
  }
  if (ranges.length === 0) return segment

  ranges.sort((a, b) => a[0] - b[0])
  let out = ''
  let cursor = 0
  for (const [start, end] of ranges) {
    if (end <= cursor) continue
    out += segment.slice(cursor, Math.max(start, cursor))
    cursor = end
  }
  return out + segment.slice(cursor)
}

function expandRange(segment: string, start: number, end: number): [number, number] {
  let s = start
  let e = end
  // 「11月18日（周三）前」这种连写：星期注记与截止词要依次吃掉
  for (let i = 0; i < 3; i += 1) {
    const tail = AFTER_TIME_RE.exec(segment.slice(e))
    if (!tail) break
    e += tail[0].length
  }
  const head = BEFORE_TIME_RE.exec(segment.slice(0, s))
  if (head) s -= head[0].length
  return [Math.max(0, s), e]
}

function cleanTitle(text: string): string {
  let out = text
  for (let i = 0; i < 4; i += 1) {
    const before = out
    for (const re of LEADING_NOISE) out = out.replace(re, '')
    out = out.replace(/^[：:，,\s、-]+/, '')
    if (out === before) break
  }
  return out
    // 时间短语被裁掉后常留下悬空的虚词和标点：「，请尽快…」「于把…」「…在前提交」
    .replace(/^[\s，,、；;：:]+/, '')
    .replace(/^[于在为的]\s*/, '')
    .replace(/(?:本班|各班|全班)/g, '')
    .replace(/[，,、；;：:]+$/, '')
    .replace(/[。！？!?]+$/, '')
    .replace(/[，,、；;\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    // 中文之间不该留空格：中英文之间的空格保留
    .replace(/(?<=[\u4e00-\u9fa5，。；：、])\s+(?=[\u4e00-\u9fa5])/g, '')
    .replace(/^[，,、；;\s]+/, '')
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

/** 把同一句话的时间替换成另一个日期（用于「本周日」双候选），钟点保留 */
function overrideHitDate(hit: TimeHit, dateMs: number): TimeHit {
  const base = startOfDay(new Date(dateMs))
  let atMs: number | null = null
  if (hit.hasClock && hit.atMs !== null) {
    const clock = new Date(hit.atMs)
    atMs = setClock(base, clock.getHours(), clock.getMinutes()).getTime()
  }
  return { ...hit, dateMs: base.getTime(), atMs, weekBoundary: undefined }
}

function localDateKey(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 解析一条候选句；overrideDateMs 用于把时间挪到另一个候选日期 */
export function parseSegment(segment: string, ref: Date, index: number, overrideDateMs?: number, inheritedDue?: number): ParsedTask | null {
  const reasons: string[] = []
  if (NEGATIVE_RE.test(segment)) return null

  const chapter = CHAPTER_RE.exec(segment)
  const body = chapter ? segment.slice(chapter[0].length).trim() : segment
  if (!body || body.length < 2) return null
  if (ROLE_LINE_RE.test(body)) return null
  // 平台/网址/链接/时间安排：纯信息段，不是待办（除非同一句里还有明确的提交动作）
  if (PLATFORM_ANY_RE.test(body) && !STRONG_ACTION_RE.test(body.replace(PLATFORM_ANY_RE, ''))) return null
  if (!PLATFORM_ANY_RE.test(body) && (PLATFORM_LINE_RE.test(body) || SCHEDULE_LINE_RE.test(body) || HEADING_LINE_RE.test(body))) return null
  // 只有章节号、没有强行动词的标题行：不产任务
  if (chapter && !STRONG_ACTION_RE.test(body) && !/(会议|考试|点名)/.test(body)) return null

  let hit = extractTime(segment, ref)
  if (hit && overrideDateMs !== undefined) hit = overrideHitDate(hit, overrideDateMs)
  const { kind, label } = detectKind(body)
  if (label) reasons.push(`命中「${label}」关键词`)

  // 同一通知只有一个截止时间时，没写时间的行动句沿用这个截止（不改变「按行动拆」）
  if (!hit && inheritedDue !== undefined) {
    if (!FALLBACK_ACTION_RE.test(body)) return null
    const title = cleanTitle(body)
    if (!title) return null
    const fieldText = segment.replace(URL_RE, ' ')
    const channel = detectChannel(fieldText)
    const labelMatch = LOCATION_LABEL_RE.exec(fieldText)
    const locationMatch = LOCATION_RE.exec(fieldText)
    let location = labelMatch ? labelMatch[1].trim() : locationMatch ? locationMatch[0].replace(/\s+/g, '') : null
    if (location && /(?:https?:|www\.|会议号|会议密码)/i.test(location)) location = null
    reasons.push('沿用本通知的唯一截止时间')
    return {
      id: stableId(segment, index),
      title,
      dueAt: inheritedDue,
      startAt: null,
      kind: kind === 'other' ? 'task' : kind,
      channel,
      location,
      url: URL_CAPTURE_RE.exec(segment)?.[0] ?? null,
      note: null,
      rawText: segment,
      confidence: 'medium',
      reasons,
      engine: 'rule',
      rrule: null,
    }
  }

  // 重复说法：每周五 / 每两周的周一 / 每月 31 号 …（先解析，后面的兜底判断要用）
  let rrule: string | null = null
  if (looksRecurring(segment)) {
    const rule = parseRecurrenceInput(segment)
    if (rule) {
      rrule = ruleToRRule(rule)
      reasons.push(`重复规则：${describeRule(rule)}`)
    }
  }

  // 通知标题行（以「通知/公告/告知/说明」结尾且没有时间）不是待办
  if (!hit && /(?:通知|公告|告知|说明)$/.test(body.trim())) return null
  // 既没有时间、也不是任何已知事项类型 → 这是通知里的寒暄/落款，不是待办
  if (!hit && kind === 'other') return null
  // 有「截止」但没有行动要求（「截止时间：11月10日」）→ 只是信息，不产任务
  if (kind === 'other' && !ACTION_RE.test(body)) return null

  const hasDeadlineWord = hit?.isDeadline ?? false
  // 光有一个日期（「今天天气不错」），既不是已知类型、也没有截止语义、还没到点 → 不是待办
  // 重复任务即使没有钟点、也不是已知类型，也应保留（如「每月31号交房租」）
  if (kind === 'other' && !hasDeadlineWord && !hit?.hasClock && !rrule) return null

  let title = segment
  if (hit) {
    title = stripTimePhrases(segment, hit)
    reasons.push(`时间短语「${hit.matched}」`)
    if (hit.note) reasons.push(hit.note)
  }
  if (rrule) {
    title = stripRecurrencePhrase(title)
    // 时间短语先被剥掉时可能留下孤立的「每」（如「每周五9点…」→「每…」）
    if (title.startsWith('每')) title = title.replace(/^每\s*/, '')
  }
  title = cleanTitle(title.replace(URL_RE, ' '))
  if (!title) title = cleanTitle(segment.replace(URL_RE, ' ')).slice(0, 28)

  const fieldText = segment.replace(URL_RE, ' ')
  const channel = detectChannel(fieldText)
  if (channel) reasons.push(`提交渠道：${channel}`)

  const labelMatch = LOCATION_LABEL_RE.exec(fieldText)
  const locationMatch = LOCATION_RE.exec(fieldText)
  let location = labelMatch ? labelMatch[1].trim() : locationMatch ? locationMatch[0].replace(/\s+/g, '') : null
  // URL / 会议号不是地点
  if (location && /(?:https?:|www\.|会议号|会议密码)/i.test(location)) location = null
  if (location) reasons.push(`地点：${location}`)
  const url = URL_CAPTURE_RE.exec(segment)?.[0] ?? null
  const note = null

  const isDeadline = hit?.isDeadline ?? false
  if (isDeadline) reasons.push('含截止语义（前 / 之前 / 截止）')

  // 截止类事项默认 23:59；会议 / 考试 / 评审这类「有开始时刻」的事项默认 09:00。
  // 但一句话里出现「前 / 截止」时，即使类型是评审也按截止处理（「11月18日前完成答辩PPT」是截止，不是开会）。
  const isEventKind = kind === 'meeting' || kind === 'exam' || kind === 'review'
  const isEvent = isEventKind && !isDeadline
  const defaultOffset = isEvent ? 9 * 3600_000 : 23 * 3600_000 + 59 * 60_000
  const clockAt = hit?.hasClock ? (hit.atMs ?? null) : null
  const dueAt = hit ? (clockAt ?? hit.dateMs + defaultOffset) : null
  const startAt = isDeadline ? null : (clockAt ?? (isEvent ? dueAt : null))

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
    startAt,
    kind,
    channel,
    location,
    url,
    note,
    rawText: segment,
    confidence,
    reasons,
    engine: 'rule',
    rrule,
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

/**
 * 一条候选句 → 候选任务列表。
 * 绝大多数情况是 1 条；「本周日」恰好落在周日当天时产出 2 条（本周 / 下周），
 * 用 choiceGroup 标记为二选一，UI 侧同组只能选一个。
 */
export function parseSegmentCandidates(segment: string, ref: Date, index: number, inheritedDue?: number): ParsedTask[] {
  const hit = extractTime(segment, ref)
  if (hit?.weekBoundary) {
    const thisWeek = parseSegment(segment, ref, index, hit.weekBoundary.thisWeek, inheritedDue)
    const nextWeek = parseSegment(segment, ref, index, hit.weekBoundary.nextWeek, inheritedDue)
    if (thisWeek && nextWeek) {
      const group = `本周日|${localDateKey(hit.weekBoundary.thisWeek)}`
      const note = '周日当天，本周=今天 23:59；下周=7 天后'
      return [
        {
          ...thisWeek,
          id: `${thisWeek.id}@this-week`,
          choiceGroup: group,
          choiceLabel: CHOICE_THIS_WEEK,
          confidence: 'low',
          reasons: [...thisWeek.reasons, note],
        },
        {
          ...nextWeek,
          id: `${nextWeek.id}@next-week`,
          choiceGroup: group,
          choiceLabel: CHOICE_NEXT_WEEK,
          confidence: 'low',
          reasons: [...nextWeek.reasons, note],
        },
      ]
    }
  }
  const single = parseSegment(segment, ref, index, undefined, inheritedDue)
  return single ? [single] : []
}


/** 标题的 2-gram 集合：用于判断「同一件事被拆成两条」 */
function titleBigrams(title: string): Set<string> {
  const chars = title.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
  const grams = new Set<string>()
  for (let i = 0; i < chars.length - 1; i += 1) grams.add(chars.slice(i, i + 2))
  return grams
}

function titleSimilar(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b || a.includes(b) || b.includes(a)) return true
  const ga = titleBigrams(a)
  const gb = titleBigrams(b)
  if (ga.size === 0 || gb.size === 0) return false
  let shared = 0
  for (const gram of ga) if (gb.has(gram)) shared += 1
  return shared / Math.min(ga.size, gb.size) >= 0.8
}

function actionKey(title: string): string {
  return ACTION_VERB_RE.exec(title)?.[1] ?? ''
}

const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

/**
 * 同一通知里同一 due、同一 kind、标题高度重叠的条目合并成 1 条：
 * 「反馈（留存影像）」+「统计缺页教材数量并反馈（留存影像）」= 一件事。
 */
function mergeDuplicateTasks(tasks: ParsedTask[]): ParsedTask[] {
  const out: ParsedTask[] = []
  for (const task of tasks) {
    if (task.choiceGroup) {
      out.push(task)
      continue
    }
    const dueKey = localDateKey((task.dueAt ?? task.startAt) as number)
    const duplicate = out.find(
      (existing) =>
        !existing.choiceGroup &&
        existing.kind === task.kind &&
        localDateKey((existing.dueAt ?? existing.startAt) as number) === dueKey &&
        actionKey(existing.title) === actionKey(task.title) &&
        titleSimilar(existing.title, task.title),
    )
    if (!duplicate) {
      out.push(task)
      continue
    }
    // 合并：标题取更完整的一条，字段取非空，置信度取高，理由去重
    if (task.title.length > duplicate.title.length) {
      duplicate.title = task.title
      duplicate.rawText = task.rawText
    }
    duplicate.channel = duplicate.channel ?? task.channel
    duplicate.location = duplicate.location ?? task.location
    duplicate.url = duplicate.url ?? task.url ?? null
    duplicate.note = duplicate.note ?? task.note ?? null
    if (CONF_RANK[task.confidence] > CONF_RANK[duplicate.confidence]) duplicate.confidence = task.confidence
    for (const reason of task.reasons) {
      if (!duplicate.reasons.includes(reason)) duplicate.reasons.push(reason)
    }
  }
  return out
}


const URL_CAPTURE_RE = /https?:\/\/[^\s，。；;)）\]】'"]+/i
const RANGE_PAIR_RE =
  /((?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|(?:\d{4}年)?\d{1,2}月\d{1,2}日|\d{1,2}日))\s*(?:(\d{1,2})[:：](\d{2}))?\s*(?:-|—|–|~|～|至|到)\s*((?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|(?:\d{4}年)?\d{1,2}月\d{1,2}日|\d{1,2}日))\s*(?:(\d{1,2})[:：](\d{2}))?/
const COMPETITION_TITLE_RE = /(挑战赛|比赛|大赛|竞赛|程序设计|考试)/
const MARKETING_RE = /(免费|获奖率|简历添彩|评综测|加分|祝取得好成绩|名额有限|先到先得)/

interface DateParts {
  date: Date
  hour: number | null
  minute: number | null
}

function parseDateParts(text: string, ref: Date): DateParts | null {
  const full = /(?:(\d{4})\s*[年]?[-/.]?)?(\d{1,2})月(\d{1,2})日/.exec(text)
  const dayOnly = /(\d{1,2})日/.exec(text)
  const clock = /(\d{1,2})[:：](\d{2})/.exec(text)
  let date: Date
  if (full) date = new Date(Number(full[1] ?? ref.getFullYear()), Number(full[2]) - 1, Number(full[3]))
  else if (dayOnly) date = new Date(ref.getFullYear(), ref.getMonth(), Number(dayOnly[1]))
  else return null
  return {
    date,
    hour: clock ? Number(clock[1]) : null,
    minute: clock ? Number(clock[2]) : null,
  }
}

/** 取「11月5日9:00-11月8日22:00」的起止；缺钟点时起点 09:00、终点 23:59 */
function parseRangePair(text: string, ref: Date): { startAt: number; dueAt: number } | null {
  const match = RANGE_PAIR_RE.exec(text)
  if (!match) return null
  const start = parseDateParts(match[1] + (match[2] ? ' ' + match[2] + ':' + match[3] : ''), ref)
  const end = parseDateParts(match[4] + (match[5] ? ' ' + match[5] + ':' + match[6] : ''), ref)
  if (!start || !end) return null
  const startAt = setClock(start.date, start.hour ?? 9, start.minute ?? 0).getTime()
  const dueAt = setClock(end.date, end.hour ?? 23, end.minute ?? 59).getTime()
  return { startAt, dueAt }
}

/**
 * 结构化多事项：编号标题 + 链接 + 考试时间区间。
 * 只在「至少 2 个编号事项都带时间区间」时启用，避免误伤普通通知。
 */
export function parseStructuredNotice(raw: string, ref: Date = new Date()): ParsedTask[] {
  const lines = raw.split(/\r?\n/).map((line) => line.trim())
  const headings: Array<{ line: number; title: string }> = []
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^[一二三四五六七八九十\d]+[、.．)）]\s*(.+?)\s*$/.exec(lines[i])
    if (!match) continue
    const title = cleanTitle(match[1]).replace(/[：:]$/, '').trim()
    if (!title) continue
    if (/^(?:报名|考试|学习|提交|时间|日期|地点|对象|要求|说明|注意|联系|温馨|活动)/.test(title)) continue
    headings.push({ line: i, title })
  }
  if (headings.length < 2) return []

  // 末尾「温馨提示」：逐条抽取，营销句丢掉
  const tipLines: string[] = []
  const tipIndex = lines.findIndex((line) => /温馨提示/.test(line))
  if (tipIndex >= 0) {
    const text = lines
      .slice(tipIndex)
      .join(' ')
      .replace(/^.*?温馨提示[：:]?/, '')
    for (const sentence of text.split(/(?<=[。；;])/)) {
      const cleaned = sentence.trim()
      if (cleaned && !MARKETING_RE.test(cleaned)) tipLines.push(cleaned)
    }
  }
  const globalTip = tipLines.join('').trim()

  const items: ParsedTask[] = []
  headings.forEach((heading, index) => {
    const endLine = index + 1 < headings.length ? headings[index + 1].line : lines.length
    const blockLines = lines.slice(heading.line + 1, endLine)
    const blockText = blockLines.join('\n')
    const range = parseRangePair(blockText, ref)
    if (!range) return
    const url = URL_CAPTURE_RE.exec(blockText)?.[0] ?? null
    const blockNote = blockLines.find((line) => /链接/.test(line) && /更新/.test(line))?.trim() ?? ''
    const note = [blockNote ? `${blockNote}；` : '', globalTip].filter(Boolean).join('\n') || null
    const kind: TaskKind = COMPETITION_TITLE_RE.test(`${heading.title} ${blockText}`) ? 'exam' : 'task'
    items.push({
      id: stableId(`structured|${heading.title}`, index),
      title: heading.title,
      dueAt: range.dueAt,
      startAt: range.startAt,
      endAt: range.dueAt,
      kind,
      channel: null,
      location: null,
      url,
      note,
      rawText: [lines[heading.line], ...blockLines].join('\n'),
      confidence: 'high',
      reasons: ['按编号识别为独立事项', '时间按考试时间区间取起止'],
      engine: 'rule',
      rrule: null,
    })
  })
  return items.length >= 2 ? items : []
}

export interface ParseResult {
  tasks: ParsedTask[]
  warnings: string[]
}

/** 一段通知 → 一组待办 */
export function parseNotice(raw: string, ref: Date = new Date()): ParseResult {
  const structured = parseStructuredNotice(raw, ref)
  if (structured.length >= 2) {
    return { tasks: structured, warnings: [] }
  }

  const segments = splitSegments(raw)
  const parsedBySegment = segments.map((segment, index) => parseSegmentCandidates(segment, ref, index))
  let tasks = mergeDuplicateTasks(parsedBySegment.flat())

  // 一条通知可能有多件事，但只写了一个截止时间：没写时间的行动句沿用这个截止
  const dueSet = new Set(tasks.map((task) => task.dueAt).filter((due): due is number => due !== null))
  if (dueSet.size === 1) {
    const fallbackDue = [...dueSet][0]
    const kept = tasks.filter((task) => task.dueAt !== null || task.startAt !== null)
    const extra = segments.flatMap((segment, index) => {
      const own = parsedBySegment[index]
      if (own.length > 0 && own.every((task) => task.dueAt !== null || task.startAt !== null)) return []
      return parseSegmentCandidates(segment, ref, index, fallbackDue).filter(
        (task) => task.dueAt !== null || task.startAt !== null,
      )
    })
    tasks = mergeDuplicateTasks([...kept, ...extra])
  }

  const warnings: string[] = []

  if (segments.length === 0) warnings.push('这段文本太短，没找到可解析的内容')
  else if (tasks.length === 0) warnings.push('识别到文字，但没找到带时间的待办事项')
  if (tasks.some((t) => t.confidence === 'low')) warnings.push('有低置信度条目，已高亮标出，请人工核对')

  return { tasks, warnings }
}
