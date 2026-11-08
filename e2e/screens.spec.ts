import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'

/**
 * v0.10 UI 排版截图（不是断言测试）：1920×1080 / 360×800，有数据 & 空数据。
 * 产物在 .tmp/v010-screens/（已 gitignore），供发版前人工核对。
 */
const OUT = '.tmp/v010-screens'

async function seed(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '更多 ▾' }).click()
  await page.getByRole('menuitem', { name: '工作群示例' }).click()
  await page.getByRole('button', { name: '开始解析' }).click()
  await page.getByRole('heading', { name: /识别到 \d+ 条待办/ }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: '全部收录' }).click()
}

async function goView(page: import('@playwright/test').Page, name: RegExp) {
  const nav = page.getByRole('navigation', { name: '主视图' })
  await nav.getByRole('button', { name }).click()
  await page.waitForTimeout(300)
}

test.describe('v0.10 截图', () => {
  test('1920 有数据（月历 + 统计）', async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await seed(page)
    await goView(page, /^月历/)
    await page.screenshot({ path: `${OUT}/1920-month-data.png`, fullPage: true })
    await goView(page, /^统计/)
    await page.screenshot({ path: `${OUT}/1920-stats-data.png`, fullPage: true })
  })

  test('1920 无数据（月历 + 统计）', async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/')
    await goView(page, /^月历/)
    await page.screenshot({ path: `${OUT}/1920-month-empty.png`, fullPage: true })
    await goView(page, /^统计/)
    await page.screenshot({ path: `${OUT}/1920-stats-empty.png`, fullPage: true })
  })

  test('360 有数据（月历 + 统计）', async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 360, height: 800 })
    await seed(page)
    await goView(page, /^月历/)
    await page.screenshot({ path: `${OUT}/360-month-data.png`, fullPage: true })
    await goView(page, /^统计/)
    await page.screenshot({ path: `${OUT}/360-stats-data.png`, fullPage: true })
  })

  test('360 无数据（月历 + 统计）', async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('/')
    await goView(page, /^月历/)
    await page.screenshot({ path: `${OUT}/360-month-empty.png`, fullPage: true })
    await goView(page, /^统计/)
    await page.screenshot({ path: `${OUT}/360-stats-empty.png`, fullPage: true })
  })
})
