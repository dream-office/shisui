import { expect, test } from '@playwright/test'

function pngSize(buf: Buffer) {
  // PNG IHDR: width @16, height @20 (big-endian)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

test('V21 麦苗绿：token / 图标 / PWA 色一致', async ({ page, request }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')

  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const color = (name: string) => {
      probe.style.color = `var(${name})`
      return getComputedStyle(probe).color
    }
    const out = {
      h: s.getPropertyValue('--h').trim(),
      c: s.getPropertyValue('--c').trim(),
      tint: s.getPropertyValue('--l-tint').trim(),
      accent: color('--accent'),
      accentInk: color('--accent-ink'),
      btnFrom: color('--btn-from'),
    }
    probe.remove()
    return out
  })
  expect(tokens.h).toBe('150')
  expect(parseFloat(tokens.c)).toBeCloseTo(0.11, 3)
  expect(tokens.tint).toBe('0')
  expect(tokens.btnFrom).toBe(tokens.accentInk)
  expect(tokens.accent).not.toBe(tokens.accentInk)

  const iconFiles = [
    ['/icons/icon-192.png', 192],
    ['/icons/icon-512.png', 512],
    ['/icons/apple-touch-icon.png', 180],
    ['/icons/icon-maskable-512.png', 512],
  ] as const
  for (const [path, size] of iconFiles) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(200)
    expect(pngSize(await res.body()), path).toEqual({ width: size, height: size })
  }

  const svg = await (await request.get('/icons/icon.svg')).text()
  expect(svg).toContain('#2F6B3F')
  expect(svg.toLowerCase()).toContain('#ffffff')

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', './icons/icon.svg')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', './icons/apple-touch-icon.png')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', './manifest.webmanifest')
  const sw = await (await request.get('/sw.js')).text()
  expect(sw).toContain("const CACHE = 'shisui-v2.1.0'")

  const signature = await page.evaluate(() => {
    const btn = document.querySelector('.signature-btn') as HTMLElement
    const mark = btn.querySelector('.signature-mark') as HTMLElement
    const bs = getComputedStyle(btn)
    const ms = getComputedStyle(mark)
    return { width: mark.offsetWidth, height: mark.offsetHeight, radius: ms.borderRadius, opacity: bs.opacity, fontSize: bs.fontSize }
  })
  expect(signature).toEqual({ width: 10, height: 10, radius: '2px', opacity: '0.55', fontSize: '11.5px' })

  const iconChecks = await page.evaluate(async () => {
    const load = async (src: string) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      return { img, ctx, data: ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data }
    }
    const apple = await load('/icons/apple-touch-icon.png')
    const icon = await load('/icons/icon-192.png')
    const icon512 = await load('/icons/icon-512.png')
    const mask = await load('/icons/icon-maskable-512.png')
    const maskBg = [mask.data[0], mask.data[1], mask.data[2]]
    const iconBg = [icon.data[0], icon.data[1], icon.data[2]]
    const icon512Bg = [icon512.data[0], icon512.data[1], icon512.data[2]]
    const appleBg = [apple.data[0], apple.data[1], apple.data[2]]
    let minAlpha = 255
    for (let i = 3; i < apple.data.length; i += 4) minAlpha = Math.min(minAlpha, apple.data[i])
    let minX = 512
    let minY = 512
    let maxX = 0
    let maxY = 0
    let maxRadius = 0
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const i = (y * 512 + x) * 4
        if (mask.data[i] > 200 && mask.data[i + 1] > 200 && mask.data[i + 2] > 200) {
          maxRadius = Math.max(maxRadius, Math.hypot(x - 255.5, y - 255.5))
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }
    return { appleMinAlpha: minAlpha, maskBg, iconBg, icon512Bg, appleBg, maxRadius, mask: { minX, minY, maxX, maxY } }
  })
  expect(iconChecks.appleMinAlpha).toBe(255)
  for (const bg of [iconChecks.iconBg, iconChecks.icon512Bg, iconChecks.appleBg, iconChecks.maskBg]) {
    expect(bg[0]).toBeCloseTo(47, 0)
    expect(bg[1]).toBeCloseTo(107, 0)
    expect(bg[2]).toBeCloseTo(63, 0)
  }
  // 80% 安全区：中心 410px（51..461）
  expect(iconChecks.mask.minX).toBeGreaterThanOrEqual(51)
  expect(iconChecks.mask.minY).toBeGreaterThanOrEqual(51)
  expect(iconChecks.mask.maxX).toBeLessThanOrEqual(461)
  expect(iconChecks.mask.maxY).toBeLessThanOrEqual(461)
  // 圆形遮罩：中心 80% 直径 410 → 半径 205；内容不超过 204.8
  expect(iconChecks.maxRadius).toBeLessThanOrEqual(204.8)

  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest.theme_color).toBe('#2F6B3F')
  expect(manifest.background_color).toBe('#F0F8F1')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F0F8F1')

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1B3B23')
})
