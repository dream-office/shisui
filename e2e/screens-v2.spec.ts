
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v2-final')

test.describe('v2.0 亮暗截图', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

  for (const theme of ['light', 'dark'] as const) {
    for (const [width, height] of [[1280, 900], [360, 800]] as const) {
      test(`${theme} @${width}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme })
        await page.setViewportSize({ width, height })
        await page.goto('/')
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        const tag = `${theme}-${width}`
        await page.screenshot({ path: join(OUT, `inbox-empty-${tag}.png`) })
        await page.getByRole('button', { name: '更多 ▾' }).click()
        await page.getByRole('menuitem', { name: '工作群示例' }).click()
        await page.getByRole('button', { name: '开始解析' }).click()
        await page.getByRole('heading', { name: /识别到 \d+ 条待办/ }).waitFor({ timeout: 15_000 })
        await page.screenshot({ path: join(OUT, `inbox-candidates-${tag}.png`) })
        await page.getByRole('button', { name: '全部收录' }).click()
        const nav = page.getByRole('navigation', { name: '主视图' })
        for (const [name, file] of [['日程', 'plan'], ['月历', 'calendar'], ['统计', 'stats'], ['设置', 'settings']] as const) {
          await nav.getByRole('button', { name: new RegExp(`^${name}`) }).click()
          await page.waitForTimeout(200)
          await page.screenshot({ path: join(OUT, `${file}-${tag}.png`) })
        }
      })
    }
  }
})
