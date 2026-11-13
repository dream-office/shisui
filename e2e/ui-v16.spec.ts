
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
    // 进入二级说明，Esc 只关最上层，回到图片选择
    await page.getByRole('button', { name: '本地 OCR（离线）' }).click()
    await expect(page.getByRole('dialog', { name: '本地识别说明' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '选择图片识别方式' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(more).toBeFocused()
  })
})


test('C. 玻璃面只在输入卡/弹窗/dock/移动顶条；off 兜底布局零位移', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  const glass = await page.locator('.composer').evaluate((el) => getComputedStyle(el, '::before').backdropFilter)
  expect(glass).toContain('blur')
  const sidebar = await page.locator('.sidebar').evaluate((el) => getComputedStyle(el).backdropFilter)
  expect(sidebar).toBe('none')
  const before = await page.locator('.composer').boundingBox()

  await page.evaluate(() => document.documentElement.setAttribute('data-glass', 'off'))
  const off = await page.locator('.composer').evaluate((el) => ({
    filter: getComputedStyle(el, '::before').backdropFilter,
    display: getComputedStyle(el, '::before').display,
    bg: getComputedStyle(el).backgroundColor,
  }))
  expect(off.filter).toBe('none')
  expect(off.display).toBe('none')
  expect(off.bg).not.toBe('rgba(0, 0, 0, 0)')
  const after = await page.locator('.composer').boundingBox()
  expect(Math.round(after!.height)).toBe(Math.round(before!.height))
  await page.evaluate(() => document.documentElement.removeAttribute('data-glass'))

  await page.setViewportSize({ width: 360, height: 800 })
  await page.reload()
  const dock = await page.locator('.dock').evaluate((el) => getComputedStyle(el).backdropFilter)
  const bar = await page.locator('.mobile-bar').evaluate((el) => getComputedStyle(el).backdropFilter)
  expect(dock).toContain('blur')
  expect(bar).toContain('blur')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})


test('D. 侧栏/dock：aria-current、roving tabindex、方向键移动焦点', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  const items = page.locator('.sb-item')
  await expect(items).toHaveCount(5)
  await expect(items.nth(0)).toHaveAttribute('aria-current', 'page')
  const tabIndexes = await items.evaluateAll((els) => els.map((el) => (el as HTMLButtonElement).tabIndex))
  expect(tabIndexes).toEqual([0, -1, -1, -1, -1])
  await items.nth(0).focus()
  await page.keyboard.press('ArrowDown')
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.press('End')
  await expect(items.nth(4)).toBeFocused()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  const dock = page.locator('.dock-item')
  await expect(dock).toHaveCount(5)
  await expect(dock.nth(0)).toHaveAttribute('aria-current', 'page')
  await expect(dock.nth(0)).toHaveAttribute('tabindex', '0')
})


test('E. 暗色输入面：正文/聚焦/禁用/玻璃关闭都不落浅底', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const measure = () => page.locator('.composer-input').evaluate((el) => {
    const s = getComputedStyle(el)
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
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
    const bg = rgb(s.backgroundColor)
    const fg = rgb(s.color)
    const l1 = lum(bg)
    const l2 = lum(fg)
    return {
      bgLum: l1,
      ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
    }
  })

  const normal = await measure()
  expect(normal.bgLum).toBeLessThan(0.25)
  expect(normal.ratio).toBeGreaterThanOrEqual(4.5)

  await page.locator('.composer-input').focus()
  const focused = await measure()
  expect(focused.bgLum).toBeLessThan(0.25)
  expect(focused.ratio).toBeGreaterThanOrEqual(4.5)

  await page.locator('.composer-input').evaluate((el) => { (el as HTMLTextAreaElement).disabled = true })
  const disabled = await measure()
  expect(disabled.bgLum).toBeLessThan(0.25)
  await page.locator('.composer-input').evaluate((el) => { (el as HTMLTextAreaElement).disabled = false })

  await page.evaluate(() => document.documentElement.setAttribute('data-glass', 'off'))
  const off = await measure()
  expect(off.bgLum).toBeLessThan(0.25)
  await page.evaluate(() => document.documentElement.removeAttribute('data-glass'))
})


test('F. 卡片四类 + 按钮/输入四档：28/32/36/44', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  const h = (locator: import('@playwright/test').Locator) =>
    locator.evaluate((el) => Math.round(el.getBoundingClientRect().height))

  expect(await h(page.locator('.composer .btn').first())).toBe(36)
  expect(await h(page.locator('.sb-help'))).toBe(32)

  await page.getByRole('button', { name: '怎么用' }).click()
  expect(await h(page.locator('.help-panel .icon-btn'))).toBe(28)
  await page.keyboard.press('Escape')

  const empty = page.locator('.empty').first()
  await expect(empty).toBeVisible()
  expect(await empty.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('20px')
  expect(await page.locator('.empty-state').first().evaluate((el) => getComputedStyle(el).padding)).toBe('24px')

  await page.getByRole('navigation', { name: /主视图|Main views/ }).first()
    .getByRole('button', { name: /^设置/ }).click()
  expect(await h(page.locator('.field input').first())).toBe(36)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  expect(await h(page.locator('.composer .btn').first())).toBe(44)
})
