/**
 * 统计导出固定色板：与页面 --chart-* 同源（light 绿/状态绿/琥珀）。
 * Canvas 不能读 CSS 变量，因此集中在这里；color-v2 e2e 会校验页面 token 与导出一致。
 */
export const CHART_PALETTE = {
  paper: '#FCFBFA',
  ink: '#1F1D1A',
  ink2: '#6E6A61',
  ink3: '#7D786D',
  line: '#E8E4DA',
  accent: '#58A069',
  green: '#137738',
  amber: '#8A5F18',
} as const
