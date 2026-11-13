import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { expect, test } from '@playwright/test'

const PORT = 5281
const BASE = `http://127.0.0.1:${PORT}/projects/shisui`
const ROOT = join(process.cwd(), 'dist', 'embedded')
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}
let server: Server

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    let rel = pathname.startsWith('/projects/shisui')
      ? pathname.slice('/projects/shisui'.length)
      : '/'
    if (!rel || rel === '/') rel = '/index.html'
    if (!extname(rel)) rel = '/index.html'
    const file = normalize(join(ROOT, rel))
    if (!file.startsWith(normalize(ROOT))) {
      res.writeHead(403)
      res.end()
      return
    }
    try {
      let body = await readFile(file)
      if (file.endsWith('index.html')) {
        // 模拟宿主在路由模板里写 html[data-theme]
        body = Buffer.from(
          body
            .toString('utf8')
            .replace('data-shell="embedded"', 'data-shell="embedded" data-theme="dark"'),
        )
      }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      const html = await readFile(join(ROOT, 'index.html'))
      res.writeHead(200, { 'content-type': TYPES['.html'] })
      res.end(
        Buffer.from(
          html
            .toString('utf8')
            .replace('data-shell="embedded"', 'data-shell="embedded" data-theme="dark"'),
        ),
      )
    }
  })
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve))
})

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test('E1. embedded：无导航/页脚/PWA，宿主主题生效，深链刷新', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/plan`)
  await expect(page.locator('html')).toHaveAttribute('data-shell', 'embedded')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.sidebar')).toHaveCount(0)
  await expect(page.locator('.dock')).toHaveCount(0)
  await expect(page.locator('.footer')).toHaveCount(0)
  await expect(page.locator('.mobile-bar')).toHaveCount(0)
  await expect(page.locator('.embedded-head button')).toBeVisible()
  await expect(page.locator('main')).toContainText('日程')
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0)
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(0)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)

  await page.reload()
  await expect(page.locator('main')).toContainText('日程')

  await page.setViewportSize({ width: 320, height: 720 })
  await page.reload()
  const overflow320 = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow320).toBeLessThanOrEqual(1)
})

test('E2. embedded 设置：无主题/语言/隐私，数据功能保留', async ({ page }) => {
  await page.goto(`${BASE}/settings`)
  await expect(page.locator('main')).toContainText('备份与恢复')
  await expect(page.locator('main')).toContainText('图片识别')
  await expect(page.locator('main')).not.toContainText('界面语言')
  await expect(page.locator('main')).not.toContainText('跟随系统')
  await expect(page.locator('.segmented')).toHaveCount(0)
  await expect(page.locator('.footer')).toHaveCount(0)
  const sw = await page.evaluate(
    () => 'serviceWorker' in navigator && !!navigator.serviceWorker.controller,
  )
  expect(sw).toBe(false)
})
