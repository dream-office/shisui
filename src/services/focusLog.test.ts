import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dailyFocus } from './focusLog'
import {
  beginFocusSession,
  endFocusSession,
  readFocusSessions,
  summarizeFocusSessions,
  type FocusSession,
} from './focusLog'

const ACTIVE_KEY = 'shisui.focus.active'
const SESSIONS_KEY = 'shisui.focus.sessions'
const REF = new Date(2026, 10, 11, 18, 0, 0).getTime() // 2026-11-11 18:00

function session(start: Date, minutes: number): FocusSession {
  return { startedAt: start.getTime(), endedAt: start.getTime() + minutes * 60_000 }
}

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => {
      map.clear()
    },
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key)
    },
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

let localStore: Storage
let sessionStore: Storage

beforeEach(() => {
  localStore = memoryStorage()
  sessionStore = memoryStorage()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { localStorage: localStore, sessionStorage: sessionStore },
  })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('summarizeFocusSessions', () => {
  it('按最近 7 个自然日汇总，并单独给出今天', () => {
    const sessions = [
      session(new Date(2026, 10, 11, 10, 0), 30),
      session(new Date(2026, 10, 10, 14, 0), 60),
      session(new Date(2026, 10, 5, 9, 0), 20), // 7 天窗口的第一天
      session(new Date(2026, 10, 4, 9, 0), 90), // 窗口外
    ]
    const summary = summarizeFocusSessions(sessions, REF)
    expect(summary.totalMs).toBe(110 * 60_000)
    expect(summary.todayMs).toBe(30 * 60_000)
    expect(summary.sessions).toBe(3)
  })

  it('空记录返回全零，不返回 NaN', () => {
    expect(summarizeFocusSessions([], REF)).toEqual({ totalMs: 0, todayMs: 0, sessions: 0 })
  })

  it('未来结束的记录不计入', () => {
    const sessions = [session(new Date(2026, 10, 12, 9, 0), 30)]
    expect(summarizeFocusSessions(sessions, REF).sessions).toBe(0)
  })

  it('跨 7 天窗口起点只算窗口内那一段', () => {
    const across = {
      startedAt: new Date(2026, 10, 4, 23, 50).getTime(), // 窗口外：11-04 23:50
      endedAt: new Date(2026, 10, 5, 0, 10).getTime(), // 窗口内：11-05 00:10
    }
    const summary = summarizeFocusSessions([across], REF)
    expect(summary.totalMs).toBe(10 * 60_000)
    expect(summary.todayMs).toBe(0)
    expect(summary.sessions).toBe(1)
  })

  it('跨零点的时段只把今天那一段算进今天', () => {
    const across = {
      startedAt: new Date(2026, 10, 10, 23, 50).getTime(),
      endedAt: new Date(2026, 10, 11, 0, 10).getTime(),
    }
    const summary = summarizeFocusSessions([across], REF)
    expect(summary.totalMs).toBe(20 * 60_000)
    expect(summary.todayMs).toBe(10 * 60_000)
  })
})

describe('专注计时生命周期', () => {
  it('超过 1 分钟的时段落一条记录，并清掉进行中的开始时间', () => {
    const start = new Date(2026, 10, 11, 10, 0, 0).getTime()
    beginFocusSession(start)
    expect(endFocusSession(start + 90_000)).toEqual({ startedAt: start, endedAt: start + 90_000 })
    expect(readFocusSessions()).toEqual([{ startedAt: start, endedAt: start + 90_000 }])
    expect(sessionStore.getItem(ACTIVE_KEY)).toBeNull()
  })

  it('不足 1 分钟不记，但清掉开始时间，避免下次接着算', () => {
    const start = new Date(2026, 10, 11, 10, 0, 0).getTime()
    beginFocusSession(start)
    expect(endFocusSession(start + 30_000)).toBeNull()
    expect(readFocusSessions()).toEqual([])
    expect(sessionStore.getItem(ACTIVE_KEY)).toBeNull()
  })

  it('同一页面里重复 begin 不会重置开始时间', () => {
    const start = new Date(2026, 10, 11, 10, 0, 0).getTime()
    beginFocusSession(start)
    beginFocusSession(start + 10 * 60_000)
    expect(endFocusSession(start + 20 * 60_000)).toEqual({
      startedAt: start,
      endedAt: start + 20 * 60_000,
    })
  })

  it('超过 4 小时的残留不记账', () => {
    const start = new Date(2026, 10, 11, 10, 0, 0).getTime()
    beginFocusSession(start)
    expect(endFocusSession(start + 5 * 3_600_000)).toBeNull()
    expect(readFocusSessions()).toEqual([])
  })

  it('上次页面加载留下的开始时间不会被这次继续使用', () => {
    const now = new Date(2026, 10, 11, 10, 0, 0).getTime()
    sessionStore.setItem(
      ACTIVE_KEY,
      JSON.stringify({ startedAt: now - 3 * 3_600_000, loadId: 'old-load' }),
    )
    beginFocusSession(now)
    expect(endFocusSession(now + 90_000)).toEqual({ startedAt: now, endedAt: now + 90_000 })
  })

  it('旧页面加载的进行中时段在 end 时不记账', () => {
    const start = new Date(2026, 10, 11, 10, 0, 0).getTime()
    sessionStore.setItem(
      ACTIVE_KEY,
      JSON.stringify({ startedAt: start - 90_000, loadId: 'old-load' }),
    )
    expect(endFocusSession(start)).toBeNull()
    expect(readFocusSessions()).toEqual([])
    expect(sessionStore.getItem(ACTIVE_KEY)).toBeNull()
  })

  it('损坏的 active / sessions JSON 不崩', () => {
    const start = new Date(2026, 10, 11, 10, 0, 0).getTime()
    sessionStore.setItem(ACTIVE_KEY, '{bad json')
    localStore.setItem(SESSIONS_KEY, 'not-an-array')
    expect(readFocusSessions()).toEqual([])
    beginFocusSession(start)
    expect(endFocusSession(start + 90_000)).toEqual({ startedAt: start, endedAt: start + 90_000 })
    expect(readFocusSessions()).toHaveLength(1)
  })
})

describe('readFocusSessions 过滤异常记录', () => {
  it('过短、过长、倒序、非数字的记录都丢弃', () => {
    localStore.setItem(
      SESSIONS_KEY,
      JSON.stringify([
        { startedAt: 1_000, endedAt: 31_000 }, // 30 秒
        { startedAt: 0, endedAt: 5 * 3_600_000 }, // 5 小时
        { startedAt: 2_000, endedAt: 1_000 }, // 倒序
        { startedAt: 'x', endedAt: 90_000 },
        { startedAt: 0, endedAt: 90_000 }, // 合法
      ]),
    )
    expect(readFocusSessions()).toEqual([{ startedAt: 0, endedAt: 90_000 }])
  })
})


describe('v1.6 dailyFocus', () => {
  it('按自然日切分，跨零点只算当天，返回 7 天', () => {
    const day = new Date(2026, 10, 11, 12, 0, 0).getTime()
    const dayStart = new Date(2026, 10, 11, 0, 0, 0).getTime()
    const points = dailyFocus(
      [
        { startedAt: dayStart + 60_000, endedAt: dayStart + 3_660_000 },
        { startedAt: dayStart - 60_000, endedAt: dayStart + 60_000 },
      ],
      day,
      7,
    )
    expect(points).toHaveLength(7)
    expect(points[6].dayStart).toBe(dayStart)
    expect(Math.round(points[6].totalMs / 60_000)).toBe(61)
    expect(points[6].sessions).toBe(2)
  })
})
