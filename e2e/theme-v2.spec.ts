
import { expect, test, type Page } from '@playwright/test'

async function contrast(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')!
    const toRgb = (color: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    const lum = (rgb: number[]) => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
    }
    const ratio = (a: number[], b: number[]) => {
      const l1 = lum(a)
      const l2 = lum(b)
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    }
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const token = (name: string) => {
      probe.style.color = `var(${name})`
      return toRgb(getComputedStyle(probe).color)
    }
    const result = {
      t3: ratio(token('--t-3'), token('--bg')),
      onAccent: ratio(token('--on-accent'), token('--btn-from')),
    }
    probe.remove()
    return result
  })
}

test.describe('v2.0 暗色主题', () => {
  test('T1. 跟随系统：dark 自动生效，meta theme-color 同步', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E1A12')
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).not.toBe('rgb(245, 246, 251)')
  })

  test('T2. 设置页亮/暗切换并持久化', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('radio', { name: '暗色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1E1A12')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('radio', { name: '亮色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('T3. 暗色 320 不溢出 + 对比度 AA', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')
    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1)
    const ratios = await contrast(page)
    expect(ratios.t3).toBeGreaterThanOrEqual(4.5)
    expect(ratios.onAccent).toBeGreaterThanOrEqual(4.5)
  })
})
