
import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v112-screens')

test.describe('v1.1.2 截图', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

  for (const width of [1920, 360]) {
    test(`空态 + 关于块 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^日程/ }).click()
      await page.waitForTimeout(250)
      await page.screenshot({ path: join(OUT, `empty-${width}.png`), fullPage: true })

      await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
      // 回到顶部再截整页，避免 sticky header 在滚动位置重复出现在页面中部
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(250)
      await page.screenshot({ path: join(OUT, `about-${width}.png`), fullPage: true })
    })
  }
})
