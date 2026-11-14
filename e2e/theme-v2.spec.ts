
import { expect, test, type Page } from '@playwright/test'

async function contrast(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')!
    const toRgb = (color: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    const lum = (rgb: number[]) => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
    }
    const ratio = (a: number[], b: number[]) => {
      const l1 = lum(a)
      const l2 = lum(b)
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    }
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const token = (name: string) => {
      probe.style.color = `var(${name})`
      return toRgb(getComputedStyle(probe).color)
    }
    const result = {
      t3: ratio(token('--t-3'), token('--bg')),
      onAccent: ratio(token('--on-accent'), token('--btn-from')),
    }
    probe.remove()
    return result
  })
}

test.describe('v2.0 暗色主题', () => {
  test('T1. 跟随系统：dark 自动生效，meta theme-color 同步', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1A1815')
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).not.toBe('rgb(245, 246, 251)')
  })

  test('T2. 设置页亮/暗切换并持久化', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('radio', { name: '暗色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1A1815')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('radio', { name: '亮色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('T3. 暗色 320 不溢出 + 对比度 AA', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')
    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1)
    const ratios = await contrast(page)
    expect(ratios.t3).toBeGreaterThanOrEqual(4.5)
    expect(ratios.onAccent).toBeGreaterThanOrEqual(4.5)
  })
})


test('T4. 暗色 toast 对比度 >= 4.5（含 update-toast 基类）', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: '更多 ▾' }).click()
  await page.getByRole('menuitem', { name: '工作群示例' }).click()
  await page.getByRole('button', { name: '开始解析' }).click()
  await page.getByRole('heading', { name: /识别到 \d+ 条待办/ }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: '全部收录' }).click()
  const toast = page.locator('.toast').first()
  await expect(toast).toBeVisible()
  const ratios = await toast.evaluate((el) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')!
    const toRgb = (color: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    const lum = (rgb: number[]) => {
      const f = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
    }
    const style = getComputedStyle(el)
    const bg = toRgb(style.backgroundColor)
    const fg = toRgb(style.color)
    const l1 = lum(bg)
    const l2 = lum(fg)
    return {
      ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
      bg: style.backgroundColor,
      fg: style.color,
    }
  })
  expect(ratios.ratio, `${ratios.bg} on ${ratios.fg}`).toBeGreaterThanOrEqual(4.5)
  // update-toast 与 toast 同基类：同一组 token 在暗色下也必须成立
  const updateRatio = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'toast update-toast'
    document.body.appendChild(probe)
    const s = getComputedStyle(probe)
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')!
    const rgb = (color: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    const lum = (c: number[]) => {
      const f = (v: number) => {
        const x = v / 255
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    const a = lum(rgb(s.backgroundColor))
    const b = lum(rgb(s.color))
    probe.remove()
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
  expect(updateRatio).toBeGreaterThanOrEqual(4.5)
})


test('P5. 暗色壳：首屏 PWA 色、无亮底、玻璃、固定亮色持久化', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1A1815')

  const lightBlocks = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
    const ctx = canvas.getContext('2d')!
    const rgb = (c: string) => { ctx.clearRect(0,0,1,1); ctx.fillStyle = c; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data] }
    const lum = (c: number[]) => { const f=(v:number)=>{const x=v/255;return x<=0.03928?x/12.92:((x+0.055)/1.055)**2.4}; return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]) }
    return [...document.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect()
      if (r.width * r.height < 400) return false
      const c = rgb(getComputedStyle(el).backgroundColor)
      return c[3] > 200 && lum(c) > 0.8
    }).map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 60) })).slice(0, 10)
  })
  expect(lightBlocks).toEqual([])
  expect(await page.locator('.composer').evaluate((el) => getComputedStyle(el, '::before').backdropFilter)).toContain('blur')

  await page.evaluate(() => localStorage.setItem('shisui.theme', 'light'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#FAF7F0')
  await page.evaluate(() => localStorage.setItem('shisui.theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  expect(await page.locator('.dock').evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur')
  expect(await page.locator('.mobile-bar').evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur')
  expect(await page.locator('.sidebar').evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none')
})
