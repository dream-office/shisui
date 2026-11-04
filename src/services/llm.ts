/**
 * 大模型增强引擎（可选）：调用任意 OpenAI 兼容接口，用结构化 Prompt 抽取待办。
 * ---------------------------------------------------------------------------
 * 三条硬约束，都是为了「可复现」与「不糊弄评审」：
 *  1. 没有配置 Key 时整个功能静默降级，规则引擎照样完整可用；
 *  2. temperature = 0，同输入尽量同输出；
 *  3. 流式返回，把「AI 正在读、正在写」的中间态暴露在界面上，而不是转圈等黑盒。
 */
import type { Confidence, ParsedTask, TaskKind } from '@/core/types'

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

const STORAGE_KEY = 'kedaibiao.llm.config'

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

const KIND_LIST: TaskKind[] = ['homework', 'exam', 'meeting', 'signup', 'payment', 'survey', 'other']

/**
 * 意图控制的核心在这里：把「AI 该做什么、不该做什么、拿不准怎么办」全部写成可执行规则。
 * 这段 Prompt 是本项目的核心资产之一，改动必须同步更新 docs/DEVLOG.md。
 */
export function buildMessages(raw: string, ref: Date) {
  const refText = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')} ${String(ref.getHours()).padStart(2, '0')}:${String(ref.getMinutes()).padStart(2, '0')}`
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][ref.getDay()]

  const system = [
    '你是「校园通知结构化抽取器」。你只输出 JSON，不输出任何解释性文字。',
    '',
    '任务：从一段班级群 / 教务 / 辅导员通知里，抽取「学生必须亲自去做、且有明确时间」的事项。',
    '',
    '抽取原则：',
    '1. 只抽有行动要求的事项。寒暄、落款、免责声明、纯信息罗列一律不抽。',
    '2. 时间必须换算成绝对时刻（timezone: Asia/Shanghai）。当前时间是 ' + refText + '（' + weekday + '）。',
    '3. 相对说法按下列规则换算，不要猜：',
    '   - 「本周X / 这周X」= 本周的星期X；「下周X」= 下一周的星期X；「周X」= 最近的未来星期X',
    '   - 「今天/明天/后天」按当前日期顺延；「N天内」= 当前日期 + N 天',
    '   - 截止类（前 / 之前 / 截止 / 前提交）没有钟点时默认 23:59',
    '   - 会议 / 考试类没有钟点时默认 09:00',
    '4. 信息来源里没有的字段一律填 null。禁止编造地点、渠道、时间。',
    '5. 一句话里有两件事就拆成两条记录。',
    '6. 拿不准就把 confidence 设为 "low"，并说明原因。',
    '',
    '输出格式（严格 JSON，不要 markdown 代码块）：',
    '{"tasks":[{"title":"干净的一句话标题，不含时间短语","kind":"' +
      KIND_LIST.join('|') +
      '","dueAt":"ISO8601 或 null","startAt":"ISO8601 或 null","channel":"学习通/邮箱/纸质/线上 等 或 null","location":"地点 或 null","confidence":"high|medium|low","reason":"一句话说明判断依据"}]}',
  ].join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: '通知原文：\n' + raw },
  ]
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

function toParsedTask(row: Record<string, unknown>, index: number): ParsedTask | null {
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  if (!title) return null
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
    channel: typeof row.channel === 'string' && row.channel.trim() ? row.channel.trim() : null,
    location: typeof row.location === 'string' && row.location.trim() ? row.location.trim() : null,
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
  return rows
    .map((row, index) => (row && typeof row === 'object' ? toParsedTask(row as Record<string, unknown>, index) : null))
    .filter((task): task is ParsedTask => task !== null)
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
