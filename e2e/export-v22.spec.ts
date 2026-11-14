import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHART_PALETTE } from '../src/services/chartPalette'

const OUT = join(process.cwd(), '.tmp', 'v2.2-b2', 'export')

test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

test('V22 统计导出：CSV/PNG 可下载可打开，PNG 为金色板', async ({ page }) => {
  expect(CHART_PALETTE).toMatchObject({ accent: '#C9A227', dark: '#7A5B12', warn: '#A85A16' })
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  await page.getByRole('button', { name: '更多 ▾' }).click()
  await page.getByRole('menuitem', { name: '工作群示例' }).click()
  await page.getByRole('button', { name: '开始解析' }).click()
  await page.getByRole('heading', { name: /识别到 \d+ 条待办/ }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: '全部收录' }).click()
  // 去日程完成一条本周任务，确保 8 周趋势有非零柱（chart-1 才会落到导出画布）
  const nav = page.getByRole('navigation', { name: '主视图' }).first()
  await nav.getByRole('button', { name: /^日程/ }).click()
  await page.getByRole('button', { name: '标记为已完成' }).first().click()
  await nav.getByRole('button', { name: /^统计/ }).click()
  await page.waitForTimeout(300)

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 CSV' }).click(),
  ])
  await csv.saveAs(join(OUT, 'stats.csv'))
  const [png] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 PNG' }).click(),
  ])
  await png.saveAs(join(OUT, 'stats.png'))

  const csvText = readFileSync(join(OUT, 'stats.csv'), 'utf8')
  expect(csvText.length).toBeGreaterThan(50)
  expect(csvText.split(/\r?\n/).filter(Boolean).length).toBe(31)

  const pngBuf = readFileSync(join(OUT, 'stats.png'))
  expect(pngBuf.subarray(1, 4).toString('ascii')).toBe('PNG')
  expect(pngBuf.readUInt32BE(16)).toBe(2400)
  expect(pngBuf.readUInt32BE(20)).toBe(3200)

  const colorCheck = await page.evaluate(async (base64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${base64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const near = (r: number, g: number, b: number, tr: number, tg: number, tb: number) =>
      Math.abs(r - tr) <= 5 && Math.abs(g - tg) <= 5 && Math.abs(b - tb) <= 5
    let accent = 0
    let darkGold = 0
    let oldGold = 0
    let green = 0
    let purple = 0
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
      if (near(r, g, b, 201, 162, 39)) accent++
      if (near(r, g, b, 122, 91, 18)) darkGold++
      if (near(r, g, b, 184, 149, 65)) oldGold++
      if (near(r, g, b, 19, 119, 56)) green++
      if (near(r, g, b, 91, 87, 240)) purple++
    }
    return { accent, darkGold, oldGold, green, purple }
  }, pngBuf.toString('base64'))
  expect(colorCheck.accent).toBeGreaterThan(1000)
  expect(colorCheck.darkGold).toBeGreaterThan(1000)
  expect(colorCheck.oldGold).toBe(0)
  expect(colorCheck.green).toBe(0)
  expect(colorCheck.purple).toBe(0)
})
