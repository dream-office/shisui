import { CHART_PALETTE as P } from './chartPalette'
import type { KindCount, Stats, WeekCompletion } from 'shisui-core'
import type { FocusDay } from './focusLog'

export interface StatsExportData {
  stats: Stats
  trend: WeekCompletion[]
  kinds: KindCount[]
  focus: FocusDay[]
  kindLabel: (kind: KindCount['kind']) => string
  lang: 'zh' | 'en'
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** 统计 CSV：摘要 + 8 周趋势 + 类型分布 + 7 天专注 */
export function buildStatsCsv(data: StatsExportData): string {
  const en = data.lang === 'en'
  const rows: (string | number | null)[][] = []
  rows.push([en ? 'metric' : '指标', en ? 'value' : '数值'])
  rows.push([en ? 'completion this week (%)' : '本周完成率(%)', data.stats.completion])
  rows.push([en ? 'edit rate (%)' : '解析手改率(%)', data.stats.editRate])
  rows.push([en ? 'late completion (%)' : '延期完成率(%)', data.stats.lateRate])
  rows.push([en ? 'total tasks' : '全部任务', data.stats.total])
  rows.push([en ? 'open' : '未完成', data.stats.open])
  rows.push([en ? 'skipped' : '已跳过', data.stats.skipped])
  rows.push([en ? 'done with time' : '有完成时间的已完成', data.stats.doneWithTime])
  rows.push([en ? 'late done' : '延期完成', data.stats.lateDone])
  rows.push([])
  rows.push([en ? 'week start' : '周起始', en ? 'total' : '到期数', en ? 'done' : '完成', en ? 'rate (%)' : '完成率(%)'])
  for (const point of data.trend) {
    rows.push([new Date(point.weekStart).toISOString().slice(0, 10), point.total, point.done, point.rate])
  }
  rows.push([])
  rows.push([en ? 'kind' : '类型', en ? 'count' : '数量'])
  for (const item of data.kinds) rows.push([data.kindLabel(item.kind), item.count])
  rows.push([])
  rows.push([en ? 'day' : '日期', en ? 'focus minutes' : '专注分钟', en ? 'sessions' : '次数'])
  for (const day of data.focus) {
    rows.push([new Date(day.dayStart).toISOString().slice(0, 10), Math.round(day.totalMs / 60_000), day.sessions])
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function downloadTextFile(fileName: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/** 无图表库：用 canvas 画一张可分享的统计图（2x 缩放，白底） */
export function renderStatsPng(canvas: HTMLCanvasElement, data: StatsExportData): void {
  const en = data.lang === 'en'
  const width = 1200
  const height = 1600
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(2, 2)
  ctx.fillStyle = P.paper
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = P.ink
  ctx.font = '600 36px system-ui, sans-serif'
  ctx.fillText(en ? 'Shisui · Stats' : '拾穗 · 统计', 60, 80)
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillStyle = P.ink3
  ctx.fillText(new Date().toLocaleString(en ? 'en-US' : 'zh-CN', { hour12: false }), 60, 112)

  const metrics: [string, string][] = [
    [en ? 'Completion this week' : '本周完成率', data.stats.completion === null ? '—' : `${data.stats.completion}%`],
    [en ? 'Edit rate' : '解析手改率', data.stats.editRate === null ? '—' : `${data.stats.editRate}%`],
    [en ? 'Late completion' : '延期完成率', data.stats.lateRate === null ? '—' : `${data.stats.lateRate}%`],
    [en ? 'Open / total' : '未完成 / 全部', `${data.stats.open} / ${data.stats.total}`],
  ]
  ctx.font = '600 44px system-ui, sans-serif'
  metrics.forEach(([label, value], index) => {
    const x = 60 + (index % 2) * 560
    const y = 190 + Math.floor(index / 2) * 120
    ctx.fillStyle = P.ink3
    ctx.font = '18px system-ui, sans-serif'
    ctx.fillText(label, x, y)
    ctx.fillStyle = P.ink
    ctx.font = '600 42px system-ui, sans-serif'
    ctx.fillText(String(value), x, y + 48)
  })

  const drawBars = (title: string, values: { label: string; value: number; display: string }[], top: number, color: string) => {
    ctx.fillStyle = P.ink
    ctx.font = '600 24px system-ui, sans-serif'
    ctx.fillText(title, 60, top)
    const max = Math.max(1, ...values.map((item) => item.value))
    values.forEach((item, index) => {
      const y = top + 34 + index * 44
      const barWidth = Math.round((item.value / max) * 720)
      ctx.fillStyle = P.line
      ctx.fillRect(300, y - 18, 720, 24)
      ctx.fillStyle = color
      ctx.fillRect(300, y - 18, barWidth, 24)
      ctx.fillStyle = P.ink2
      ctx.font = '16px system-ui, sans-serif'
      ctx.fillText(item.label, 60, y)
      ctx.fillStyle = P.ink
      ctx.font = '600 16px system-ui, sans-serif'
      ctx.fillText(item.display, 1040, y)
    })
  }

  drawBars(
    en ? '8-week completion' : '8 周完成趋势',
    data.trend.map((point) => ({
      label: new Date(point.weekStart).toLocaleDateString(en ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric' }),
      value: point.rate ?? 0,
      display: point.rate === null ? '—' : `${point.rate}%`,
    })),
    en ? 460 : 460,
    P.gold,
  )
  drawBars(
    en ? 'Task kinds' : '任务类型分布',
    data.kinds.map((item) => ({ label: data.kindLabel(item.kind), value: item.count, display: String(item.count) })),
    940,
    P.green,
  )
  drawBars(
    en ? 'Focus · last 7 days' : '每日专注 · 近 7 天',
    data.focus.map((day) => ({
      label: new Date(day.dayStart).toLocaleDateString(en ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric' }),
      value: Math.round(day.totalMs / 60_000),
      display: `${Math.round(day.totalMs / 60_000)} min`,
    })),
    1280,
    P.amber,
  )
}

export function downloadStatsPng(data: StatsExportData, fileName: string): void {
  const canvas = document.createElement('canvas')
  renderStatsPng(canvas, data)
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
