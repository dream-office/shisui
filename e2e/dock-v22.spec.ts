import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v2.2-b2')

test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

test('v2.2 悬浮底栏：viewport-fit、10px 边距、safe-area、5 项 44px', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)

  const dock = page.locator('.dock')
  await expect(dock).toBeVisible()
  await expect(page.locator('.dock-item')).toHaveCount(5)
  await expect(page.locator('.dock-item[aria-current="page"]')).toHaveCount(1)

  const normal = await page.evaluate(() => {
    const dock = document.querySelector('.dock')!.getBoundingClientRect()
    const main = getComputedStyle(document.querySelector('.main')!)
    const item = document.querySelector('.dock-item')!.getBoundingClientRect()
    return {
      left: dock.left,
      right: dock.right,
      bottom: dock.bottom,
      width: dock.width,
      radius: getComputedStyle(document.querySelector('.dock')!).borderRadius,
      mainBottom: main.paddingBottom,
      itemHeight: item.height,
    }
  })
  expect(normal.left).toBeCloseTo(10, 0)
  expect(normal.right).toBeCloseTo(380, 0)
  expect(normal.bottom).toBeCloseTo(836, 0)
  expect(normal.radius).toBe('18px')
  expect(normal.mainBottom).toBe('96px')
  expect(normal.itemHeight).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: join(OUT, 'dock-after-light-390.png'), fullPage: false })

  // 模拟 iPhone 底部安全区 34px（桌面浏览器 env() 为 0）
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-bottom', '34px'))
  const safe = await page.evaluate(() => {
    const dock = document.querySelector('.dock')!.getBoundingClientRect()
    return { bottom: dock.bottom, mainBottom: getComputedStyle(document.querySelector('.main')!).paddingBottom }
  })
  expect(safe.bottom).toBeCloseTo(802, 0)
  expect(safe.mainBottom).toBe('130px')
  await page.screenshot({ path: join(OUT, 'dock-safe-light-390.png'), fullPage: false })

  for (const width of [360, 320]) {
    await page.setViewportSize({ width, height: 800 })
    const geo = await page.evaluate(() => {
      const dock = document.querySelector('.dock')!.getBoundingClientRect()
      return {
        left: dock.left,
        right: dock.right,
        bottom: dock.bottom,
        radius: getComputedStyle(document.querySelector('.dock')!).borderRadius,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(geo.overflow, `${width} overflow`).toBeLessThanOrEqual(1)
    expect(geo.left, `${width} dock left`).toBeCloseTo(10, 0)
    expect(geo.right, `${width} dock right`).toBeCloseTo(width - 10, 0)
    expect(geo.bottom, `${width} dock bottom`).toBeCloseTo(758, 0)
    expect(geo.radius, `${width} dock radius`).toBe('18px')
  }
})
