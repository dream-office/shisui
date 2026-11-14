import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v2.2-b2', 'screens')

test.describe('v2.2 五屏 1280/390/360/320 亮暗截图', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1280, 390, 360, 320] as const) {
      test(`${theme} @${width}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await page.setViewportSize({ width, height: width === 1280 ? 900 : 800 })
        await page.goto('/')
        await page.getByRole('button', { name: '更多 ▾' }).click()
        await page.getByRole('menuitem', { name: '工作群示例' }).click()
        await page.getByRole('button', { name: '开始解析' }).click()
        await page.getByRole('heading', { name: /识别到 \d+ 条待办/ }).waitFor({ timeout: 15_000 })
        await page.getByRole('button', { name: '全部收录' }).click()

        const inboxOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(inboxOverflow, `${theme} ${width} inbox overflow`).toBeLessThanOrEqual(1)
        await page.screenshot({ path: join(OUT, `${theme}-${width}-inbox.png`), fullPage: true })

        const nav = page.getByRole('navigation', { name: '主视图' }).first()
        for (const [name, file] of [
          ['日程', 'plan'],
          ['月历', 'calendar'],
          ['统计', 'stats'],
          ['设置', 'settings'],
        ] as const) {
          await nav.getByRole('button', { name: new RegExp(`^${name}`) }).click()
          await page.waitForTimeout(250)
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          expect(overflow, `${theme} ${width} ${file} overflow`).toBeLessThanOrEqual(1)
          if (file === 'plan') {
            const bodyWidth = await page.locator('.task-body').first().evaluate((el) => el.getBoundingClientRect().width)
            expect(bodyWidth, `${theme} ${width} task title width`).toBeGreaterThan(200)
          }
          await page.screenshot({ path: join(OUT, `${theme}-${width}-${file}.png`), fullPage: true })
        }
      })
    }
  }
})
