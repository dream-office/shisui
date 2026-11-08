
import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v130-import')
const FIX = join(process.cwd(), 'e2e', 'fixtures')

test.describe('v1.3 截图', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

  test('文档导入', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.locator('.import-panel input[type="file"]').first().setInputFiles(join(FIX, 'notice.txt'))
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, 'document-import.png'), fullPage: false })
  })

  test('图片选择', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.locator('.import-panel input[type="file"]').nth(1).setInputFiles(join(FIX, 'photo.png'))
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(OUT, 'image-choice.png'), fullPage: false })
  })

  test('OCR 声明', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.locator('.import-panel input[type="file"]').nth(1).setInputFiles(join(FIX, 'photo.png'))
    await page.getByRole('button', { name: '本地 OCR（离线）' }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(OUT, 'ocr-notice.png'), fullPage: false })
  })

  test('设置-图片识别', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    const section = page.locator('section.card').filter({ hasText: '图片识别' }).first()
    await section.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await section.screenshot({ path: join(OUT, 'settings-image-mode.png') })
  })
})
