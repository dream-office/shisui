
import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v131-toolbar')

test.describe('v1.3.1 工具栏截图', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

  for (const [width, height] of [[1280, 900], [360, 640]] as const) {
    test(`更多菜单 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await page.getByRole('button', { name: '更多 ▾' }).click()
      await page.waitForTimeout(200)
      await page.screenshot({ path: join(OUT, `more-${width}.png`), fullPage: false })
    })
  }
})
