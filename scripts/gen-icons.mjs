#!/usr/bin/env node
/**
 * 从 public/icons/icon.svg（及 maskable 版）生成 PWA 图标。
 * 不手改 PNG；换主题色时只改 SVG 底色，再跑：
 *   node scripts/gen-icons.mjs
 *
 * 依赖项目已有的 @playwright/test；Windows 默认用 Edge（PLAYWRIGHT_CHANNEL=msedge）。
 * 输出路径保持不变：
 *   icon-192.png / icon-512.png / apple-touch-icon.png / icon-maskable-512.png
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const icons = join(root, 'public', 'icons')
const icon = readFileSync(join(icons, 'icon.svg'), 'utf8')
const maskable = readFileSync(join(icons, 'icon-maskable.svg'), 'utf8')

const pageHtml = (svg) => `<!doctype html>
<html><head><style>
  html, body { margin: 0; width: 100%; height: 100%; background: #2F6B3F; }
  svg { display: block; width: 100vw; height: 100vh; }
</style></head><body>${svg}</body></html>`

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' })
const page = await browser.newPage()

async function render(svg, size, file) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(pageHtml(svg), { waitUntil: 'load' })
  await page.screenshot({ path: join(icons, file), omitBackground: false })
  console.log(`✓ ${file} ${size}×${size}`)
}

try {
  await render(icon, 192, 'icon-192.png')
  await render(icon, 512, 'icon-512.png')
  await render(icon, 180, 'apple-touch-icon.png')
  await render(maskable, 512, 'icon-maskable-512.png')
} finally {
  await browser.close()
}
