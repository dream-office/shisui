/**
 * 专注日志：只记录「完整结束」的专注时段，存 localStorage，不上传。
 *
 * 计时生命周期：
 * - 开始时间存 sessionStorage：每个标签页独立，关标签页自动清掉，不会跨标签页互相踩。
 * - 页面隐藏 / 关闭 / 刷新（pagehide）时落一条；页面恢复（pageshow / 可见）时重新开始。
 * - 每次页面加载生成一个 LOAD_ID；即使浏览器把旧 sessionStorage 一起恢复回来，
 *   对不上当前加载的旧开始时间也不会被当成本次专注。
 * - 超过 4 小时的单次记录视为「忘了退出」的异常残留，读/写都丢弃，避免污染统计。
 *
 * 统计页按最近 7 个自然日汇总；不足 1 分钟的片段不记。
 */
export interface FocusSession {
  startedAt: number
  endedAt: number
}

export interface FocusSummary {
  /** 最近 7 个自然日的总时长（跨窗口边界只算窗口内部分） */
  totalMs: number
  /** 今天的总时长（跨零点只算今天部分） */
  todayMs: number
  /** 最近 7 个自然日的专注次数 */
  sessions: number
}

const ACTIVE_KEY = 'shisui.focus.active'
const SESSIONS_KEY = 'shisui.focus.sessions'
const MAX_SESSIONS = 120
const MIN_SESSION_MS = 60_000
/** 单次专注上限：超过视为异常残留（忘了退出），不记账。 */
const MAX_SESSION_MS = 4 * 3_600_000

/** 本次页面加载的标记；刷新 / 重开页面后对不上，旧的 active 计时自动作废。 */
const LOAD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

interface ActiveFocus {
  startedAt: number
  loadId: string
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** 进行中的计时只属于当前标签页，不写 localStorage。 */
function activeStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function readActive(): ActiveFocus | null {
  const store = activeStorage()
  if (!store) return null
  const raw = store.getItem(ACTIVE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const startedAt = (parsed as ActiveFocus).startedAt
    const loadId = (parsed as ActiveFocus).loadId
    if (!Number.isFinite(startedAt) || typeof loadId !== 'string') return null
    return { startedAt, loadId }
  } catch {
    return null
  }
}

/** 读取历史专注记录；损坏、倒序、过短（<1 分钟）或过长（>4 小时）的记录一律丢弃。 */
export function readFocusSessions(): FocusSession[] {
  const store = storage()
  if (!store) return []
  const raw = store.getItem(SESSIONS_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is FocusSession => {
      if (typeof item !== 'object' || item === null) return false
      const startedAt = (item as FocusSession).startedAt
      const endedAt = (item as FocusSession).endedAt
      if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return false
      const duration = endedAt - startedAt
      return duration >= MIN_SESSION_MS && duration <= MAX_SESSION_MS
    })
  } catch {
    return []
  }
}

/**
 * 打开专注模式 / 回到可见页面时调用。
 * 同一页面加载里重复调用不会重置开始时间；旧页面加载或超长残留会被丢弃后重记。
 */
export function beginFocusSession(now: number = Date.now()): void {
  const store = activeStorage()
  if (!store) return
  const active = readActive()
  if (
    active !== null &&
    active.loadId === LOAD_ID &&
    now >= active.startedAt &&
    now - active.startedAt <= MAX_SESSION_MS
  ) {
    return
  }
  try {
    const next: ActiveFocus = { startedAt: now, loadId: LOAD_ID }
    store.setItem(ACTIVE_KEY, JSON.stringify(next))
  } catch {
    // 隐私模式下写不进去，仅影响统计，不影响专注本身
  }
}

/** 暂停 / 退出专注模式时调用；返回记下的时段（不足 1 分钟或异常残留返回 null）。 */
export function endFocusSession(now: number = Date.now()): FocusSession | null {
  const activeStore = activeStorage()
  if (!activeStore) return null
  const active = readActive()
  if (active === null) return null
  try {
    activeStore.removeItem(ACTIVE_KEY)
  } catch {
    // 清不掉也不影响下面的记账；下次 begin 会覆盖
  }
  if (active.loadId !== LOAD_ID) return null
  const duration = now - active.startedAt
  if (duration < MIN_SESSION_MS || duration > MAX_SESSION_MS) return null
  const store = storage()
  if (!store) return null
  const session: FocusSession = { startedAt: active.startedAt, endedAt: now }
  try {
    const next = [...readFocusSessions(), session].slice(-MAX_SESSIONS)
    store.setItem(SESSIONS_KEY, JSON.stringify(next))
    return session
  } catch {
    return null
  }
}

/** 纯函数：按 ref 所在自然日往回数 7 天，便于单测与统计页复用。 */
export function summarizeFocusSessions(
  sessions: readonly FocusSession[],
  ref: number = Date.now(),
): FocusSummary {
  const dayStart = startOfLocalDay(ref)
  // 用日历日推进而不是 -6*86400000：夏令时切换附近自然日边界会偏一小时
  const fromDate = new Date(dayStart)
  fromDate.setDate(fromDate.getDate() - 6)
  const from = fromDate.getTime()
  const recent = sessions.filter((session) => session.endedAt >= from && session.endedAt <= ref)
  let totalMs = 0
  let todayMs = 0
  for (const session of recent) {
    const end = session.endedAt
    // 跨 7 天窗口边界的时段只算落在窗口内的部分
    totalMs += Math.max(0, end - Math.max(session.startedAt, from))
    // 跨零点的时段只把今天那一段算进「今天」
    if (end >= dayStart) todayMs += Math.max(0, end - Math.max(session.startedAt, dayStart))
  }
  return { totalMs, todayMs, sessions: recent.length }
}
