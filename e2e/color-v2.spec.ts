
import { expect, test } from '@playwright/test'
import { CHART_PALETTE } from '../src/services/chartPalette'

const THEMES = ['light', 'dark'] as const

for (const theme of THEMES) {
  test(`P4 ${theme}：token 对比度 / 图表同色板 / 签名不换`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

    const result = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')!
      const probe = document.createElement('div')
      document.body.appendChild(probe)
      const color = (name: string) => {
        probe.style.color = `var(${name})`
        return getComputedStyle(probe).color
      }
      const rgb = (value: string) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = value
        ctx.fillRect(0, 0, 1, 1)
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
      }
      const lum = (c: number[]) => {
        const f = (v: number) => {
          const x = v / 255
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
      }
      const ratio = (a: number[], b: number[]) => {
        const l1 = lum(a)
        const l2 = lum(b)
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      }
      const hex = (name: string) => {
        const c = rgb(color(name))
        return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
      }
      const bg = rgb(color('--bg'))
      const pair = (name: string) => ratio(rgb(color(name)), bg)
      const sig = document.querySelector('.signature-mark') as HTMLElement
      const sprig = document.querySelector('.sprig-mark') as SVGElement
      const out = {
        t1: pair('--t-1'),
        t3: pair('--t-3'),
        onAccent: ratio(rgb(color('--on-accent')), rgb(color('--btn-from'))),
        accentInk: pair('--accent-ink'),
        accent: pair('--accent'),
        success: pair('--success-ink'),
        warn: pair('--warn-ink'),
        danger: pair('--danger'),
        chart: [hex('--chart-1'), hex('--chart-2'), hex('--chart-3')],
        signature: getComputedStyle(sig).backgroundColor,
        sprig: getComputedStyle(sprig).color,
      }
      probe.remove()
      return out
    })

    expect(result.t1, 't1').toBeGreaterThanOrEqual(4.5)
    expect(result.t3, 't3').toBeGreaterThanOrEqual(4.5)
    expect(result.onAccent, 'on-accent').toBeGreaterThanOrEqual(4.5)
    expect(result.accentInk, 'accent-ink').toBeGreaterThanOrEqual(4.5)
    expect(result.accent, 'accent').toBeGreaterThanOrEqual(4.5)
    expect(result.success, 'success').toBeGreaterThanOrEqual(4.5)
    expect(result.warn, 'warn').toBeGreaterThanOrEqual(4.5)
    expect(result.danger, 'danger').toBeGreaterThanOrEqual(4.5)
    if (theme === 'light') {
      expect(result.chart).toEqual([CHART_PALETTE.gold, CHART_PALETTE.green, CHART_PALETTE.amber])
    } else {
      // 导出固定浅色纸张，暗色图表用暗色变体；都不得回到旧紫
      for (const color of result.chart) expect(color).not.toBe('#5B57F0')
      expect(result.chart[0]).toMatch(/^#(B89541|D0B06A)$/)
    }
    expect(result.signature).toBe('rgb(91, 87, 240)')
    expect(result.sprig).toBe('rgb(91, 87, 240)')
  })
}
