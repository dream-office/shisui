
import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v120-nav')

test.describe('v1.2.0 导航截图', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

  for (const width of [800, 860]) {
    test(`导航 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 })
      await page.goto('/')
      await page.waitForTimeout(200)
      await page.screenshot({ path: join(OUT, `nav-${width}.png`), fullPage: false })
    })
  }
})
