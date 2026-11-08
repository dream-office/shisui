import { readFile } from 'node:fs/promises'
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test'

/**
 * 冒烟用例，覆盖四条「用户最先遇到的路径」：
 *
 *  A. 首屏能打开，且没有 console error / 未捕获异常
 *  B. 示例数据 → 解析 → 收录 → 日程里能看到（主路径）
 *  C. 设置页能打开，关于/隐私声明在场
 *  D. 默认零网络请求（隐私卖点的机器验证）
 *
 * 每条都要有「能失败」的能力：断言写具体文案/计数，不用「页面没崩就行」的模糊断言。
 */

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

test.describe('首屏', () => {
  test('A. 打开无 console error，品牌与页脚在场', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: '拾穗' })).toBeVisible()
    await expect(page.getByText('群里散落的截止时间，替你捡起来')).toBeVisible()
    await expect(page.getByText('数据只存在你自己的浏览器里（IndexedDB），不上传任何服务器')).toBeVisible()

    // AGPL §13：通过网络使用本应用的人必须能拿到源码入口，页脚不许被删
    const sourceLink = page.getByRole('link', { name: /源码/ })
    await expect(sourceLink).toBeVisible()
    await expect(sourceLink).toHaveAttribute('href', 'https://github.com/dream-office/shisui')

    // 给 React 的 effect（hydrate）留一点时间，让启动期错误先冒出来
    await page.waitForTimeout(500)
    expect(errors, `控制台不应有错误：\n${errors.join('\n')}`).toEqual([])
  })
})

test.describe('主路径', () => {
  test('B. 示例数据 → 解析 → 收录 → 日程可见', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: '学校通知示例' }).click()
    await expect(page.locator('#notice')).not.toHaveValue('')

    await page.getByRole('button', { name: '开始解析' }).click()

    // 解析结果出现（规则引擎是同步的，但给慢机器留足时间）
    const results = page.getByRole('heading', { name: /识别到 \d+ 条待办/ })
    await expect(results).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: '全部收录' }).click()

    // 切到日程（取导航里的 tab，避免匹配到卡片上的「收录进日程」按钮）
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByText('日程还是空的')).toHaveCount(0)
    await expect(page.getByRole('main')).toContainText(/实验报告|学习通|截止/)
  })
})

test.describe('设置', () => {
  test('C. 设置页可打开，AI 区块与关于段落在场', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: '设置' }).click()

    await expect(page.getByRole('heading', { name: /AI 增强引擎/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: '关于拾穗' })).toBeVisible()
    // 隐私文案必须说「默认不联网」，不能说「不会离开你的浏览器」（无条件承诺）
    await expect(page.getByRole('main')).toContainText('默认不联网')
    await expect(page.getByRole('main')).not.toContainText('不会离开你的浏览器')
  })
})

test.describe('隐私', () => {
  test('D. 默认不发任何跨域网络请求', async ({ page }) => {
    const foreign: string[] = []
    const allowedOrigins = ['http://127.0.0.1:5199', 'http://localhost:5199']

    page.on('request', (req: Request) => {
      const url = req.url()
      if (url.startsWith('data:') || url.startsWith('blob:')) return
      try {
        const origin = new URL(url).origin
        if (!allowedOrigins.includes(origin)) foreign.push(url)
      } catch {
        foreign.push(url)
      }
    })

    await page.goto('/')
    // 走一遍主路径，确保解析/收录也不触发外部请求
    await page.getByRole('button', { name: '工作群示例' }).click()
    await page.getByRole('button', { name: '开始解析' }).click()
    await expect(page.getByRole('heading', { name: /识别到 \d+ 条待办/ })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '全部收录' }).click()
    await page.waitForTimeout(500)

    expect(foreign, `不应有跨域请求，实际：\n${foreign.join('\n')}`).toEqual([])
  })
})

test.describe('手动添加', () => {
  test('E. 手动添加一条 → 日程可见', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '手动添加' }).click()
    await expect(page.getByRole('heading', { name: '手动添加一条' })).toBeVisible()

    await page.getByLabel('标题').fill('把报销单交给财务')
    await page.getByRole('button', { name: '添加', exact: true }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByRole('main')).toContainText('把报销单交给财务')
  })
})

test.describe('历史', () => {
  test('F. 收录后历史留有记录，可重新解析', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '学校通知示例' }).click()
    await page.getByRole('button', { name: '开始解析' }).click()
    await expect(page.getByRole('heading', { name: /识别到 \d+ 条待办/ })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '全部收录' }).click()

    await page.getByRole('button', { name: /^历史/ }).click()
    await expect(page.getByRole('heading', { name: /导入历史/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '重新解析' }).first()).toBeVisible()
  })
})

test.describe('ICS 导出', () => {
  test('G. 导出的 .ics 含 VCALENDAR / VEVENT，且标题转义正确', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '手动添加' }).click()
    await page.getByLabel('标题').fill('交报告, 记得盖章')
    await page.getByRole('button', { name: '添加', exact: true }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出 .ics' }).click(),
    ])

    expect(download.suggestedFilename()).toMatch(/^shisui-\d{4}-\d{2}-\d{2}\.ics$/)
    const filePath = await download.path()
    expect(filePath).not.toBeNull()
    const content = await readFile(filePath as string, 'utf-8')

    expect(content).toContain('BEGIN:VCALENDAR')
    expect(content).toContain('BEGIN:VEVENT')
    expect(content).toContain('SUMMARY:交报告\\, 记得盖章') // 逗号必须被转义
    expect(content).toContain('END:VCALENDAR')
    expect(content.includes('\r\n')).toBe(true) // ICS 用 CRLF
  })
})

test.describe('ICS 导入', () => {
  const ICS_TEXT = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:import-test-1@example.com',
    'SUMMARY:导入的评审会',
    'DTSTART:20261120T010000Z',
    'DTEND:20261120T030000Z',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')

  async function pickFile(page: Page) {
    await page.getByRole('button', { name: '导入 .ics' }).click()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.ics',
      mimeType: 'text/calendar',
      buffer: Buffer.from(ICS_TEXT, 'utf-8'),
    })
  }

  test('J. 选文件 → 预览 → 确认导入 → 日程可见；再导入走更新不翻倍', async ({ page }) => {
    await page.goto('/')
    await pickFile(page)
    await expect(page.getByText(/新增 1 \/ 更新 0/)).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: '确认导入' }).click()
    await expect(page.getByText(/导入完成：新增 1 条/)).toBeVisible()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByRole('main')).toContainText('导入的评审会')

    // 同一份文件再导入一次：应当全部识别为「更新」
    await nav.getByRole('button', { name: /^收件/ }).click()
    await pickFile(page)
    await expect(page.getByText(/新增 0 \/ 更新 1/)).toBeVisible({ timeout: 15_000 })
  })

  test('K. 坏文件给出可读错误，不崩', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '导入 .ics' }).click()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'bad.ics',
      mimeType: 'text/calendar',
      buffer: Buffer.from('这不是日历文件', 'utf-8'),
    })
    await expect(page.locator('.ics-error')).toContainText('BEGIN:VCALENDAR', { timeout: 10_000 })
  })
})

test.describe('PWA', () => {
  test('H. 离线仍能打开（Service Worker 缓存了应用外壳）', async ({ page, context }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '拾穗' })).toBeVisible()

    // 等 Service Worker 激活并接管
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })

    await context.setOffline(true)
    try {
      await page.reload()
      await expect(page.getByRole('heading', { name: '拾穗' })).toBeVisible({ timeout: 15_000 })
    } finally {
      await context.setOffline(false)
    }
  })

  test('I. manifest 可访问且声明正确', async ({ page }) => {
    const response = await page.request.get('/manifest.webmanifest')
    expect(response.status()).toBe(200)

    const manifest = (await response.json()) as {
      name?: string
      start_url?: string
      icons?: { src: string; sizes: string; type: string; purpose?: string }[]
    }
    expect(manifest.name ?? '').toContain('拾穗')
    expect(manifest.start_url).toBe('./')
    expect(Array.isArray(manifest.icons) && manifest.icons.length > 0).toBe(true)

    // iOS / 部分 Android 不认 SVG 图标，必须有 PNG（192/512 与 maskable）
    const icons = manifest.icons ?? []
    expect(icons.some((icon) => icon.type === 'image/png' && icon.sizes === '192x192')).toBe(true)
    expect(icons.some((icon) => icon.type === 'image/png' && icon.sizes === '512x512')).toBe(true)
    expect(icons.some((icon) => icon.purpose === 'maskable' && icon.type === 'image/png')).toBe(true)

    // apple-touch-icon 必须是 PNG，且实际可访问
    await page.goto('/')
    const appleIcon = await page.getAttribute('link[rel="apple-touch-icon"]', 'href')
    expect(appleIcon ?? '').toMatch(/\.png$/)
    const appleResponse = await page.request.get(appleIcon as string)
    expect(appleResponse.status()).toBe(200)
    expect(appleResponse.headers()['content-type'] ?? '').toContain('image/png')

    const href = await page.getAttribute('link[rel="manifest"]', 'href')
    expect(href ?? '').toContain('manifest.webmanifest')
  })
})
