import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v2.2.1')
test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

test('v2.2.1 dock 玻璃：56–60% 亮 / 52–56% 暗，文字 ≥4.5，玻璃关闭不发灰', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 320] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await page.waitForTimeout(200)

      const result = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const ctx = canvas.getContext('2d')!
        const rgb = (color: string) => {
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = color
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
        const alpha = (color: string) => {
          const m = color.match(/rgba?\(([^)]+)\)/)
          if (!m) return 1
          const parts = m[1].split(',').map((x) => Number(x.trim()))
          return parts.length >= 4 ? parts[3] : 1
        }
        const dock = document.querySelector('.dock') as HTMLElement
        const active = dock.querySelector('.dock-item[aria-current="page"]') as HTMLElement
        const inactive = [...dock.querySelectorAll('.dock-item')].find((el) => el !== active) as HTMLElement
        const cs = getComputedStyle(dock)
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
        return {
          tokenAlpha: alpha(getComputedStyle(document.documentElement).getPropertyValue('--dock-glass-bg').trim()),
          dockAlpha: alpha(cs.backgroundColor),
          filter: cs.backdropFilter,
          inactiveContrast: ratio(rgb(getComputedStyle(inactive).color), rgb(bg)),
          activeContrast: ratio(rgb(getComputedStyle(active).color), rgb(getComputedStyle(active).backgroundColor)),
        }
      })

      expect(result.tokenAlpha, `${theme} ${width} dock alpha`).toBeGreaterThanOrEqual(theme === 'light' ? 0.56 : 0.52)
      expect(result.tokenAlpha, `${theme} ${width} dock alpha`).toBeLessThanOrEqual(theme === 'light' ? 0.6 : 0.56)
      expect(result.dockAlpha).toBeCloseTo(result.tokenAlpha, 2)
      expect(result.filter).toContain('blur(24px)')
      expect(result.filter).toContain('saturate(1.25)')
      expect(result.inactiveContrast, `${theme} ${width} dock text`).toBeGreaterThanOrEqual(4.5)
      expect(result.activeContrast, `${theme} ${width} dock active`).toBeGreaterThanOrEqual(4.5)
      await page.screenshot({ path: join(OUT, `dock-glass-after-${theme}-${width}.png`), fullPage: false })

      await page.evaluate(() => document.documentElement.setAttribute('data-glass', 'off'))
      const off = await page.evaluate(() => {
        const s = getComputedStyle(document.querySelector('.dock')!)
        return { bg: s.backgroundColor, filter: s.backdropFilter }
      })
      expect(off.bg).toMatch(/^rgb\(/)
      expect(off.filter).toBe('none')
      await page.evaluate(() => document.documentElement.removeAttribute('data-glass'))
    }
  }
})
