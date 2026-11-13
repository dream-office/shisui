
import { expect, test } from '@playwright/test'
import { join } from 'node:path'

test.describe('v1.6 UI 统一与返回路径', () => {
  test('A. 统计卡同高同内边距；收件工具栏按钮同高；320 不溢出', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^统计/ }).click()
    const metrics = page.locator('.metric-grid .metric')
    const boxes = await metrics.evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return { h: Math.round(rect.height), pad: style.padding, radius: style.borderRadius }
      }),
    )
    expect(new Set(boxes.map((box) => box.h)).size).toBe(1)
    expect(new Set(boxes.map((box) => box.pad)).size).toBe(1)
    expect(new Set(boxes.map((box) => box.radius)).size).toBe(1)

    const panels = page.locator('.stats-panel')
    const panelStyles = await panels.evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el)
        return `${s.padding}|${s.borderRadius}`
      }),
    )
    expect(new Set(panelStyles).size).toBe(1)

    await nav.getByRole('button', { name: /^收件/ }).click()
    const buttonHeights = await page.locator('.composer-actions .btn').evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    )
    expect(new Set(buttonHeights).size).toBe(1)

    await page.setViewportSize({ width: 320, height: 720 })
    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1)
  })

  test('B1. 浏览器返回：回到来源视图、恢复滚动与 tab 焦点', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 })
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^统计/ }).click()
    await expect(page.getByRole('heading', { name: '统计', exact: true })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 500))
    await page.waitForTimeout(100)
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByRole('heading', { name: '统计', exact: true })).toHaveCount(0)

    await page.goBack()
    await expect(page.getByRole('heading', { name: '统计', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(100)
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? '')
    expect(focused).toContain('统计')
  })

  test('B2. Esc 关闭弹窗并把焦点还给触发按钮', async ({ page }) => {
    await page.goto('/')
    const help = page.getByRole('button', { name: '怎么用' })
    await help.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(help).toBeFocused()

    // 图片识别弹窗：从「更多 → 识别图片」触发，Esc 后回「更多」
    const more = page.getByRole('button', { name: '更多 ▾' })
    await more.click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: '识别图片' }).click()
    const fc = await chooser
    await fc.setFiles(join(process.cwd(), 'e2e', 'fixtures', 'photo.png'))
    await expect(page.getByRole('dialog', { name: '选择图片识别方式' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(more).toBeFocused()
  })
})
