/**
 * 统计导出固定色板：与页面 --chart-* 同源（v2.2 美术金）。
 * Canvas 不能读 CSS 变量，因此集中在这里；color-v2 e2e 会校验页面 token 与导出一致。
 */
export const CHART_PALETTE = {
  paper: '#FAF7F0',
  ink: '#2D2A26',
  ink2: '#6F6A5F',
  ink3: '#7A5B12',
  line: '#E8E0D0',
  accent: '#C9A227',
  dark: '#7A5B12',
  warn: '#A85A16',
} as const
