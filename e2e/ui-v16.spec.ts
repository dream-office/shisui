
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
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const measure = () => page.locator('.composer-input').evaluate((el) => {
    const s = getComputedStyle(el)
    return { bg: s.backgroundColor, fg: s.color }
  })
  // 暗色面必须是深色 oklch（而不是浅色 token / 浏览器默认白底）
  const isDarkSurface = (color: string) => /^(oklch|oklab)\(0\.(2[0-9]|3[0-5])/.test(color)

  const normal = await measure()
  expect(isDarkSurface(normal.bg), normal.bg).toBe(true)
  expect(normal.fg).not.toBe(normal.bg)

  await page.locator('.composer-input').focus()
  const focused = await measure()
  expect(isDarkSurface(focused.bg), focused.bg).toBe(true)
  expect(focused.fg).not.toBe(focused.bg)

  await page.locator('.composer-input').evaluate((el) => { (el as HTMLTextAreaElement).disabled = true })
  const disabled = await measure()
  expect(isDarkSurface(disabled.bg), disabled.bg).toBe(true)
  await page.locator('.composer-input').evaluate((el) => { (el as HTMLTextAreaElement).disabled = false })

  await page.evaluate(() => document.documentElement.setAttribute('data-glass', 'off'))
  const off = await measure()
  expect(isDarkSurface(off.bg), off.bg).toBe(true)
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

  const errDesktop = await page.evaluate(() => {
    const el = document.createElement('div')
    el.className = 'error-state'
    document.body.appendChild(el)
    const s = getComputedStyle(el)
    const out = { radius: s.borderRadius, padding: s.padding }
    el.remove()
    return out
  })
  expect(errDesktop.radius).toBe('20px')
  expect(errDesktop.padding).toBe('24px')
  const inline = await page.evaluate(() => {
    const el = document.createElement('p')
    el.className = 'inline-alert'
    document.body.appendChild(el)
    const s = getComputedStyle(el)
    const out = { radius: s.borderRadius, padding: s.padding }
    el.remove()
    return out
  })
  expect(inline.radius).toBe('12px')
  expect(inline.padding).toBe('10px 12px')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  expect(await h(page.locator('.composer .btn').first())).toBe(44)
  const errMobile = await page.evaluate(() => {
    const el = document.createElement('div')
    el.className = 'error-state'
    document.body.appendChild(el)
    const s = getComputedStyle(el)
    const out = { radius: s.borderRadius, padding: s.padding }
    el.remove()
    return out
  })
  expect(errMobile.radius).toBe('20px')
  expect(errMobile.padding).toBe('16px')
})


test('G. P2 组件：卡片 24/16、输入 36/44、工具条 56/48、列表/弹窗', async ({ page }) => {
  const pad = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).padding)
  const height = (sel: string) => page.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().height))

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  expect(await pad('.composer.card')).toBe('24px')
  await page.getByRole('button', { name: '怎么用' }).click()
  expect(await pad('.help-panel')).toBe('24px')
  expect(await page.locator('.help-panel').evaluate((el) => getComputedStyle(el).borderRadius)).toBe('20px')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '更多 ▾' }).click()
  expect(await height('.more-item')).toBe(40)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '更多 ▾' }).click()
  await page.getByRole('menuitem', { name: '工作群示例' }).click()
  await page.getByRole('button', { name: '开始解析' }).click()
  await page.getByRole('heading', { name: /识别到 \d+ 条待办/ }).waitFor()
  expect(await pad('.candidate')).toBe('24px')
  await page.getByRole('button', { name: '全部收录' }).click()

  const nav = page.getByRole('navigation', { name: '主视图' })
  await nav.getByRole('button', { name: /^日程/ }).click()
  expect(await pad('.stat.card')).toBe('24px')
  expect(await height('.plan-toolbar')).toBeGreaterThanOrEqual(56)
  expect(await height('.search-input')).toBe(36)
  expect(await height('.task-row')).toBeGreaterThanOrEqual(44)
  expect(await page.locator('.task-row').first().evaluate((el) => getComputedStyle(el).padding)).toBe('12px 24px')

  await nav.getByRole('button', { name: /^统计/ }).click()
  expect(await height('.stats-tools')).toBeGreaterThanOrEqual(56)
  await nav.getByRole('button', { name: /^设置/ }).click()
  expect(await pad('.settings .card')).toBe('24px')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.getByRole('navigation', { name: /主视图|Main views/ }).first()
    .getByRole('button', { name: /^收件/ }).click()
  expect(await pad('.composer.card')).toBe('16px')
  expect(await height('.composer-actions')).toBeGreaterThanOrEqual(48)
  expect(await height('.composer .btn')).toBe(44)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)

  await page.setViewportSize({ width: 320, height: 720 })
  await page.reload()
  await page.getByRole('navigation', { name: /主视图|Main views/ }).first()
    .getByRole('button', { name: /^收件/ }).click()
  const overflow320 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow320).toBeLessThanOrEqual(1)
})


test('I. 设置页分段滑块 + 侧栏 brand-600/选中 chip 对比度', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  const contrast = await page.evaluate(() => {
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
    const ratio = (a: number[], b: number[]) => {
      const l1 = lum(a)
      const l2 = lum(b)
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    }
    const sidebar = document.querySelector('.sidebar') as HTMLElement
    const active = document.querySelector('.sb-item[aria-current="page"]') as HTMLElement
    const ss = getComputedStyle(sidebar)
    const as = getComputedStyle(active)
    return {
      sidebar: ratio(rgb(ss.backgroundColor), rgb(ss.color)),
      active: ratio(rgb(as.backgroundColor), rgb(as.color)),
    }
  })
  expect(contrast.sidebar).toBeGreaterThanOrEqual(4.5)
  expect(contrast.active).toBeGreaterThanOrEqual(4.5)

  await page.getByRole('navigation', { name: /主视图|Main views/ }).first()
    .getByRole('button', { name: /^设置/ }).click()
  const themeGroup = page.getByRole('radiogroup', { name: '外观' })
  await expect(themeGroup).toBeVisible()
  await expect(themeGroup.getByRole('radio')).toHaveCount(3)
  await expect(themeGroup.getByRole('radio', { name: '跟随系统' })).toHaveAttribute('aria-checked', 'true')
  const style = await themeGroup.evaluate((el) => {
    const s = getComputedStyle(el)
    const active = el.querySelector('[aria-checked="true"]') as HTMLElement
    const a = getComputedStyle(active)
    return { padding: s.padding, radius: s.borderRadius, h: Math.round(active.getBoundingClientRect().height), activeRadius: a.borderRadius, shadow: a.boxShadow }
  })
  expect(style.padding).toBe('3px')
  expect(style.radius).toBe('15px')
  expect(style.h).toBe(36)
  expect(style.activeRadius).toBe('12px')
  expect(style.shadow).not.toBe('none')

  await themeGroup.getByRole('radio', { name: '跟随系统' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(themeGroup.getByRole('radio', { name: '亮色' })).toHaveAttribute('aria-checked', 'true')
  await expect(themeGroup.getByRole('radio', { name: '亮色' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(themeGroup.getByRole('radio', { name: '暗色' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Home')
  await expect(themeGroup.getByRole('radio', { name: '跟随系统' })).toHaveAttribute('aria-checked', 'true')

  const langGroup = page.getByRole('radiogroup', { name: '界面语言' })
  await expect(langGroup.getByRole('radio')).toHaveCount(2)

  // 桌面：选项行与分段段同高 36
  const imageRows = page.locator('.image-mode-options .inline-check')
  const rowHeights = await imageRows.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
  expect(new Set(rowHeights).size, `image rows ${rowHeights}`).toBe(1)
  expect(rowHeights[0]).toBe(36)
  expect(await page.locator('.image-mode-options').evaluate((el) => getComputedStyle(el).rowGap)).toBe('8px')
  expect(await page.locator('.backup-encrypt').evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBe(36)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.getByRole('navigation', { name: /主视图|Main views/ }).first()
    .getByRole('button', { name: /^设置/ }).click()
  const mobile = page.getByRole('radiogroup', { name: '外观' })
  const mobileH = await mobile.getByRole('radio').first().evaluate((el) => Math.round(el.getBoundingClientRect().height))
  expect(mobileH).toBe(44)
  const mobileRows = await page.locator('.image-mode-options .inline-check').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
  expect(new Set(mobileRows).size, `mobile rows ${mobileRows}`).toBe(1)
  expect(mobileRows[0]).toBe(44)

  await page.setViewportSize({ width: 320, height: 720 })
  await page.reload()
  await page.getByRole('navigation', { name: /主视图|Main views/ }).first()
    .getByRole('button', { name: /^设置/ }).click()
  const overflow320 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow320).toBeLessThanOrEqual(1)
})
