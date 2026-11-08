/**
 * 大模型增强引擎（可选）：调用任意 OpenAI 兼容接口，用结构化 Prompt 抽取待办。
 * ---------------------------------------------------------------------------
 * 三条硬约束，都是为了「可复现」与「不该让用户等一个黑盒」：
 *  1. 没有配置 Key 时整个功能静默降级，规则引擎照样完整可用；
 *  2. temperature = 0，同输入尽量同输出；
 *  3. 流式返回，把「AI 正在读、正在写」的中间态暴露在界面上，而不是转圈等黑盒。
 */
import type { Confidence, ParsedTask, TaskKind } from 'shisui-core'

export interface LLMConfig {
  endpoint: string
  apiKey: string
  model: string
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  apiKey: '',
  model: 'deepseek-chat',
}

const STORAGE_KEY = 'shisui.llm.config'

export function loadLLMConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LLM_CONFIG }
    return { ...DEFAULT_LLM_CONFIG, ...(JSON.parse(raw) as Partial<LLMConfig>) }
  } catch {
    return { ...DEFAULT_LLM_CONFIG }
  }
}

export function saveLLMConfig(config: LLMConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function isLLMReady(config: LLMConfig): boolean {
  return Boolean(config.endpoint && config.apiKey && config.model)
}

const KIND_LIST: TaskKind[] = ['task', 'meeting', 'review', 'signup', 'payment', 'approval', 'survey', 'exam', 'other']

/**
 * 意图控制的核心在这里：把「AI 该做什么、不该做什么、拿不准怎么办」全部写成可执行规则。
 * 这段 Prompt 是本项目的核心资产之一，改动必须同步更新 docs/DEVLOG.md。
 */
export function buildExtractionSystemPrompt(ref: Date): string {
  const refText = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')} ${String(ref.getHours()).padStart(2, '0')}:${String(ref.getMinutes()).padStart(2, '0')}`
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][ref.getDay()]

  return [
    '你是「群消息结构化抽取器」。你只输出 JSON，不输出任何解释性文字。',
    '',
    '任务：从一段群聊 / 工作通知 / 校园通知里，抽取「必须亲自去做、且有明确时间」的事项。',
    '不要预设场景。这段消息可能来自公司项目群、部门群、客户群、班级群、家长群或学校教务，',
    '按内容判断，不要按场景套模板：公司群里有「作业」也可能指交付任务，班级群里也可能有「报销」。',
    '',
    '抽取原则：',
    '1. 只抽有行动要求的事项。寒暄、落款、免责声明、纯信息罗列一律不抽。',
    '2. 时间必须换算成绝对时刻（timezone: Asia/Shanghai）。当前时间是 ' + refText + '（' + weekday + '）。',
    '3. 相对说法按下列规则换算，不要猜：',
    '   - 「本周X / 这周X」= 本周的星期X；「下周X」= 下一周的星期X；「周X」= 最近的未来星期X',
    '   - 「今天/明天/后天」按当前日期顺延；「N天内」= 当前日期 + N 天',
    '   - 截止类（前 / 之前 / 截止 / 前提交）没有钟点时默认 23:59',
    '   - 会议 / 考试 / 评审类没有钟点时默认 09:00',
    '4. 信息来源里没有的字段一律填 null。禁止编造地点、渠道、时间。',
    '5. 一条通知可能有多件事：按不同行动/对象拆成多条，即使截止时间相同也各保留一条；只有同一行动的重复句子才合并。',
    '6. 章节标题（一、二、…）、纯平台/网址/时间安排、角色分工（学习委员负责…）不是待办，不要抽。',
    '7. URL / 网址不是 channel；location 只填真实地点或线上平台名（如「学习通」），网址放原文。',
    '8. 标题去掉编号、章节号与时间短语；标题为空或只是章节名的不要输出。',
    '9. 拿不准就把 confidence 设为 "low"，并说明原因。',
    '',
    '少样本（只学判断方式，不要照抄内容）：',
    '例1：通知含「请于11月10日23:59前统计缺页教材数量并反馈」「学习平台：https://example.edu.cn」→ 只抽 1 条 {"title":"统计缺页教材数量并反馈","kind":"task","dueAt":"2026-11-10T23:59:00+08:00","channel":null,"location":null}；网址不是条目、不是 channel。',
    '例2：同一通知「A 表 11月5日前交」「B 报告 12月30日前交」→ 2 条，因为截止时间不同。',
    '例3：「二、学习（考试）平台…」「四、学习委员负责跟进」→ 不抽；章节标题和角色分工不是待办。',
    '例4：一条竞赛通知含 3 个赛道、各自链接与考试时间 → 抽 3 条；每条独立 url；「免费/获奖率高/简历添彩」丢弃；同一份「温馨提示」写进每条 note。',
    '',
    '输出格式（严格 JSON，不要 markdown 代码块）：',
    '{"tasks":[{"title":"干净的一句话标题，不含时间短语","kind":"' +
      KIND_LIST.join('|') +
      '","dueAt":"ISO8601 或 null","startAt":"ISO8601 或 null","channel":"飞书/钉钉/邮箱/OA/学习通/纸质 等 或 null（URL/网址填 null）","location":"真实地点或线上平台名 或 null（URL 填 null）","url":"该事项的报名/考试链接（仅 http/https）或 null","note":"报名要求/温馨提示等备注 或 null","confidence":"high|medium|low","reason":"一句话说明判断依据"}]}',
  ].join('\n')
}

export function buildMessages(raw: string, ref: Date) {
  return [
    { role: 'system' as const, content: buildExtractionSystemPrompt(ref) },
    { role: 'user' as const, content: '通知原文：\n' + raw },
  ]
}

/** 图片识图用的 messages（OpenAI 兼容 content 数组） */
export function buildImageMessages(imageDataUrl: string, ref: Date) {
  const system = `${buildExtractionSystemPrompt(ref)}\n\n这是通知图片。请先阅读图片中的文字，再按同一 JSON 规则抽取；看不清的地方 confidence 设为 low。`
  return [
    { role: 'system' as const, content: system },
    {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: '通知图片：' },
        { type: 'image_url' as const, image_url: { url: imageDataUrl } },
      ],
    },
  ]
}

/** AI 识图：一次性请求（非流式）；失败给可读错误，不自动重试 */
export async function parseImageWithLLM(
  imageDataUrl: string,
  ref: Date,
  config: LLMConfig,
): Promise<ParsedTask[]> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      stream: false,
      messages: buildImageMessages(imageDataUrl, ref),
    }),
  })
  if (!response.ok) {
    if ([400, 404, 415, 422].includes(response.status)) throw new Error('AI_MODEL_NO_VISION')
    throw new Error(`AI 接口返回 ${response.status}，请检查地址与 Key`)
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('AI_MODEL_NO_VISION')
  return parseLLMResponse(extractJson(content))
}

export interface LLMProgress {
  phase: 'connecting' | 'streaming' | 'done'
  chars: number
}

/** 从模型的输出里把 JSON 抠出来，容忍代码块包裹与前后废话 */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/gm, '').replace(/```$/gm, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('模型没有返回 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

const CONF_SET = new Set<Confidence>(['high', 'medium', 'low'])

function isUrlLike(value: string): boolean {
  return /https?:\/\/|www\.|(?:^|[\s/])(?:[a-z0-9-]+\.)+(?:com|cn|edu|org|net|io)(?:[/\s]|$)/i.test(value)
}

function cleanTitle(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/^[一二三四五六七八九十百]+[、.．)）]\s*/, '')
    .replace(/^\d{1,2}\s*[、.．)）]\s*/, '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/^[：:，,\s、-]+/, '')
    .trim()
}

function cleanChannel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const channel = value.trim()
  if (!channel || isUrlLike(channel) || channel.length > 40) return null
  return channel
}

function cleanLocation(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const location = value.trim()
  if (!location || isUrlLike(location) || /(?:会议号|会议密码)/.test(location)) return null
  return location
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = value.trim()
  return /^https?:\/\//i.test(url) ? url : null
}

function cleanNote(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const note = value.trim()
  return note ? note : null
}

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
  if (!ga.size || !gb.size) return false
  let shared = 0
  for (const gram of ga) if (gb.has(gram)) shared += 1
  return shared / Math.min(ga.size, gb.size) >= 0.8
}

/** 同一 due 日 + 同 kind + 标题高度重叠的 AI 行合并，避免模型自己重复输出 */
function dedupeLlmTasks(tasks: ParsedTask[]): ParsedTask[] {
  const out: ParsedTask[] = []
  for (const task of tasks) {
    const due = task.dueAt ?? task.startAt
    const duplicate = out.find((existing) => {
      const existingDue = existing.dueAt ?? existing.startAt
      return existing.kind === task.kind && existingDue === due && titleSimilar(existing.title, task.title)
    })
    if (!duplicate) {
      out.push(task)
      continue
    }
    if (task.title.length > duplicate.title.length) duplicate.title = task.title
    duplicate.channel = duplicate.channel ?? task.channel
    duplicate.location = duplicate.location ?? task.location
    duplicate.url = duplicate.url ?? task.url ?? null
    duplicate.note = duplicate.note ?? task.note ?? null
    duplicate.confidence = CONF_RANK[task.confidence] > CONF_RANK[duplicate.confidence] ? task.confidence : duplicate.confidence
  }
  return out
}

const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

function toParsedTask(row: Record<string, unknown>, index: number): ParsedTask | null {
  const title = cleanTitle(row.title)
  if (!title) return null
  if (/^(?:学习|考试|测评)?(?:（[^）]*）)?(?:平台|网址|链接|入口|系统)[：:]?$/.test(title)) return null
  const kind = KIND_LIST.includes(row.kind as TaskKind) ? (row.kind as TaskKind) : 'other'
  const parseTime = (value: unknown): number | null => {
    if (typeof value !== 'string' || !value) return null
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? null : t
  }
  const dueAt = parseTime(row.dueAt)
  const startAt = parseTime(row.startAt)
  if (dueAt === null && startAt === null) return null
  const confidence = CONF_SET.has(row.confidence as Confidence) ? (row.confidence as Confidence) : 'medium'

  return {
    id: `llm_${index}_${title.slice(0, 8)}`,
    title,
    dueAt,
    startAt,
    kind,
    channel: cleanChannel(row.channel),
    location: cleanLocation(row.location),
    url: cleanUrl(row.url),
    note: cleanNote(row.note),
    rawText: typeof row.reason === 'string' ? row.reason : '',
    confidence: confidence === 'high' ? 'medium' : confidence, // AI 单方结论封顶 medium
    reasons: [typeof row.reason === 'string' ? `AI 判断：${row.reason}` : 'AI 抽取结果'],
    engine: 'llm',
  }
}

export function parseLLMResponse(payload: unknown): ParsedTask[] {
  if (!payload || typeof payload !== 'object') return []
  const rows = (payload as { tasks?: unknown }).tasks
  if (!Array.isArray(rows)) return []
  const tasks = rows
    .map((row, index) => (row && typeof row === 'object' ? toParsedTask(row as Record<string, unknown>, index) : null))
    .filter((task): task is ParsedTask => task !== null)
  return dedupeLlmTasks(tasks)
}

/** 真正的网络调用：流式读取 SSE，边读边回调进度 */
export async function parseWithLLM(
  raw: string,
  ref: Date,
  config: LLMConfig,
  onProgress?: (progress: LLMProgress) => void,
): Promise<ParsedTask[]> {
  onProgress?.({ phase: 'connecting', chars: 0 })

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      stream: true,
      messages: buildMessages(raw, ref),
    }),
  })

  if (!response.ok) {
    throw new Error(`AI 接口返回 ${response.status}，请检查地址与 Key`)
  }
  if (!response.body) throw new Error('当前环境不支持流式读取')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          content += delta
          onProgress?.({ phase: 'streaming', chars: content.length })
        }
      } catch {
        // 单个分片解析失败不影响整体：继续读下一个
      }
    }
  }

  onProgress?.({ phase: 'done', chars: content.length })
  return parseLLMResponse(extractJson(content))
}
