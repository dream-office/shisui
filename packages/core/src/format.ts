/**
 * 时间的人话渲染：把时间戳翻译成用户一眼就懂的相对说法。
 * 与 time.ts 相反的方向，同样注入 ref，保证渲染结果可测试。
 */
import { MS_DAY, isoWeekday, startOfDay } from './time.js'

const WEEK_CN = ['一', '二', '三', '四', '五', '六', '日']

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 今天 / 明天 / 后天 / 本周五 / 11月18日 */
export function formatDayLabel(ms: number, ref: Date = new Date()): string {
  const diff = Math.round((startOfDay(new Date(ms)).getTime() - startOfDay(ref).getTime()) / MS_DAY)
  const d = new Date(ms)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === 2) return '后天'
  if (diff === -1) return '昨天'
  if (diff > 2 && diff < 7) return `周${WEEK_CN[isoWeekday(d) - 1]}`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 完整展示：明天 20:00 / 11月18日 23:59 */
export function formatWhen(ms: number, ref: Date = new Date()): string {
  return `${formatDayLabel(ms, ref)} ${formatClock(ms)}`
}

export type CountdownTone = 'normal' | 'warn' | 'danger' | 'overdue'

export interface Countdown {
  text: string
  tone: CountdownTone
  /** 剩余小时数，负数表示已过期 */
  hours: number
}

/** 倒计时：所有颜色阈值都在这一个函数里，UI 不再做业务判断 */
export function countdown(ms: number, ref: Date = new Date()): Countdown {
  const delta = ms - ref.getTime()
  const hours = delta / 3600_000

  if (delta < 0) {
    const overdueHours = Math.floor(-hours)
    const text =
      overdueHours < 1
        ? '刚刚过期'
        : overdueHours < 24
          ? `已过期 ${overdueHours} 小时`
          : `已过期 ${Math.floor(overdueHours / 24)} 天`
    return { text, tone: 'overdue', hours }
  }

  const tone: CountdownTone = hours <= 12 ? 'danger' : hours <= 48 ? 'warn' : 'normal'

  if (hours < 1) return { text: `剩 ${Math.max(1, Math.round(hours * 60))} 分钟`, tone: 'danger', hours }
  if (hours < 24) return { text: `剩 ${Math.round(hours)} 小时`, tone, hours }
  const days = Math.floor(hours / 24)
  const rest = Math.round(hours % 24)
  if (days < 7) return { text: rest > 0 ? `剩 ${days} 天 ${rest} 小时` : `剩 ${days} 天`, tone, hours }
  return { text: `剩 ${days} 天`, tone, hours }
}

/** 用于 <input type="datetime-local"> 的值 */
export function toLocalInput(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): number | null {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}
