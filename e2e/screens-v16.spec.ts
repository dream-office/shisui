
import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v16-stats')

test.describe('v1.6 统计页截图', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

  for (const [width, height] of [
    [1280, 900],
    [360, 800],
    [320, 720],
  ] as const) {
    test(`统计页 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await page.getByRole('button', { name: '更多 ▾' }).click()
      await page.getByRole('menuitem', { name: '工作群示例' }).click()
      await page.getByRole('button', { name: '开始解析' }).click()
      await page.getByRole('heading', { name: /识别到 \d+ 条待办/ }).waitFor({ timeout: 15_000 })
      await page.getByRole('button', { name: '全部收录' }).click()
      await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^统计/ }).click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(OUT, `stats-${width}.png`), fullPage: true })
    })
  }
})
