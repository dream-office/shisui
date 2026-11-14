import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v2.2.1')
test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

for (const theme of ['light', 'dark'] as const) {
  test(`v2.2.1 ${theme} 任务完成圆圈：22px 且边框与行底 ≥3:1`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')

    await page.getByRole('button', { name: '更多 ▾' }).click()
    await page.getByRole('menuitem', { name: '工作群示例' }).click()
    await page.getByRole('button', { name: '开始解析' }).click()
    await page.getByRole('heading', { name: /识别到 \d+ 条待办/ }).waitFor()
    await page.getByRole('button', { name: '全部收录' }).click()
    await page.getByRole('navigation', { name: '主视图' }).first().getByRole('button', { name: /^日程/ }).click()
    await page.waitForTimeout(250)

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
      const effectiveBg = (el: Element) => {
        let node: Element | null = el
        while (node) {
          const bg = getComputedStyle(node).backgroundColor
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg
          node = node.parentElement
        }
        return getComputedStyle(document.body).backgroundColor
      }

      const row = document.querySelector('.task-row') as HTMLElement
      const check = row.querySelector('.check') as HTMLElement
      const rowBg = effectiveBg(row)
      const checkBg = getComputedStyle(check).backgroundColor
      const border = getComputedStyle(check).borderTopColor
      return {
        width: check.offsetWidth,
        height: check.offsetHeight,
        rowBg,
        checkBg,
        border,
        borderRatio: ratio(rgb(border), rgb(rowBg)),
        bgRatio: ratio(rgb(checkBg), rgb(rowBg)),
      }
    })

    expect(result.width).toBe(22)
    expect(result.height).toBe(22)
    expect(result.borderRatio, `${theme} border ${result.border} / row ${result.rowBg}`).toBeGreaterThanOrEqual(3)
    await page.screenshot({ path: join(OUT, `check-${theme}.png`), fullPage: false })
  })
}
