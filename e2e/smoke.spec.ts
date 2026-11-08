import { readFileSync } from 'node:fs'
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
    await expect(page.getByText('数据只存在本地浏览器里（IndexedDB），不上传服务器')).toBeVisible()

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
    await page.locator('.ics-import input[type="file"]').setInputFiles({
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
    await page.locator('.ics-import input[type="file"]').setInputFiles({
      name: 'bad.ics',
      mimeType: 'text/calendar',
      buffer: Buffer.from('这不是日历文件', 'utf-8'),
    })
    await expect(page.locator('.ics-error')).toContainText('BEGIN:VCALENDAR', { timeout: 10_000 })
  })

  test('K2. RRULE 作为重复任务导入（保留规则、不展开）', async ({ page }) => {
    const rruleIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:rrule-test@example.com',
      'SUMMARY:每周例会',
      'DTSTART:20261120T010000Z',
      'DTEND:20261120T020000Z',
      'RRULE:FREQ=WEEKLY;COUNT=8',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')

    await page.goto('/')
    await page.getByRole('button', { name: '导入 .ics' }).click()
    await page.locator('.ics-import input[type="file"]').setInputFiles({
      name: 'rrule.ics',
      mimeType: 'text/calendar',
      buffer: Buffer.from(rruleIcs, 'utf-8'),
    })

    // 不展开：8 次重复只入库 1 条，规则保留在 series 里
    await expect(page.getByText(/新增 1 \/ 更新 0/)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '确认导入' }).click()
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.locator('.series-tag').first()).toBeVisible()
  })
})

test.describe('分享目标', () => {
  test('L. 带分享参数打开 → 输入框预填 + 提示可见 + URL 已清空', async ({ page }) => {
    const shared = '明天下班前把报销单交给财务'
    await page.goto(`/?title=${encodeURIComponent('部门群')}&text=${encodeURIComponent(shared)}`)

    await expect(page.getByText('来自分享')).toBeVisible()
    await expect(page.getByLabel('群消息原文')).toHaveValue(/把报销单交给财务/)
    // replaceState 之后地址栏不应再有 query（刷新不会重复触发，也不留别人的分享内容）
    expect(new URL(page.url()).search).toBe('')

    await page.locator('.share-banner').getByRole('button', { name: '知道了' }).click()
    await expect(page.getByText('来自分享')).toBeHidden()
  })
})

test.describe('月视图', () => {
  test('M. 42 格网格、切换月份、今天按钮', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^月历/ }).click()

    await expect(page.locator('.month-cell')).toHaveCount(42)
    const title = page.locator('.month-title')
    const initial = (await title.textContent()) ?? ''

    await page.getByRole('button', { name: '下个月' }).click()
    await expect(title).not.toHaveText(initial)

    await page.getByRole('button', { name: '今天' }).click()
    await expect(title).toHaveText(initial)
  })

  test('N. 拖拽任务到另一天：日期变化、时刻保留', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '手动添加' }).click()
    await page.getByLabel('标题').fill('拖我试试')
    // 显式填今天 23:00：默认值在 18:00 之后会顺延到明天，测试不能依赖运行时刻
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T23:00`
    await page.locator('.manual input[type="datetime-local"]').fill(today)
    await page.getByRole('button', { name: '添加', exact: true }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^月历/ }).click()

    const todayCell = page.locator('.month-cell.is-today')
    const todayEpoch = Number(await todayCell.getAttribute('data-day'))
    const targetCell = page.locator(`.month-cell[data-day="${todayEpoch + 86_400_000}"]`)
    await expect(targetCell).toHaveCount(1)

    const source = page.locator('.day-task', { hasText: '拖我试试' })
    await expect(source).toBeVisible()
    await source.dragTo(targetCell)

    const moved = page.locator('.day-task', { hasText: '拖我试试' })
    await expect(moved).toBeVisible()
    await expect(moved).toContainText('23:00')
  })

  test('O. 360px 宽度下不横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^月历/ }).click()
    await expect(page.locator('.month-grid')).toBeVisible()

    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1)
  })

  test('C6. 点击某天只显示当天任务', async ({ page }) => {
    await page.goto('/')

    // 两天各加一条（用 datetime-local 指定日期，避免依赖“今天”）
    const addTask = async (title: string, when: string) => {
      await page.getByRole('button', { name: '手动添加' }).click()
      await page.getByLabel('标题').fill(title)
      await page.getByLabel('截止时间').fill(when)
      await page.getByRole('button', { name: '添加', exact: true }).click()
    }
    await addTask('二十号的活', '2026-11-20T18:00')
    await addTask('二十一号的活', '2026-11-21T09:00')

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^月历/ }).click()

    const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime()
    await page.locator(`.month-cell[data-day="${day(2026, 11, 20)}"]`).click()

    const list = page.locator('.month-day')
    await expect(list).toContainText('二十号的活')
    await expect(list).not.toContainText('二十一号的活')
  })

  test('C8. 跨月拖拽：拖到相邻月份日期后月份与日期正确', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '手动添加' }).click()
    await page.getByLabel('标题').fill('月底跨月')
    await page.getByLabel('截止时间').fill('2026-11-30T18:00')
    await page.getByRole('button', { name: '添加', exact: true }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^月历/ }).click()

    const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime()
    await page.locator(`.month-cell[data-day="${day(2026, 11, 30)}"]`).click()

    const source = page.locator('.day-task', { hasText: '月底跨月' })
    await expect(source).toBeVisible()
    // 12 月 1 日这一格在 11 月的网格里是「下月」格子，可以接收拖拽
    const target = page.locator(`.month-cell[data-day="${day(2026, 12, 1)}"]`)
    await expect(target).toHaveCount(1)
    await source.dragTo(target)

    const dayCard = page.locator('.month-day')
    await expect(dayCard).toContainText('12 月 1 日')
    await expect(dayCard).toContainText('月底跨月')
  })
})

test.describe('批量粘贴', () => {
  test('P. 多段粘贴 → 批量预览 → 全选/全不选 → 收录选中', async ({ page }) => {
    await page.goto('/')
    const text = ['本周五23:59前交实验报告', '下周三下午2点3楼会议室开会'].join('\n\n')
    await page.getByLabel('群消息原文').fill(text)
    await page.getByRole('button', { name: '开始解析' }).click()

    await expect(page.getByRole('heading', { name: /批量预览/ })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/已选 2/)).toBeVisible()

    await page.getByRole('button', { name: '全不选' }).click()
    await expect(page.getByText(/已选 0/)).toBeVisible()

    await page.getByRole('button', { name: '全选' }).click()
    await page.getByRole('button', { name: /收录选中/ }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByRole('main')).toContainText('实验报告')
  })
})

test.describe('统计', () => {
  test('Q. 统计页显示两个指标；无数据时显示「—」而不是 0%', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^统计/ }).click()

    await expect(page.getByText('本周完成率')).toBeVisible()
    await expect(page.getByText('解析手改率')).toBeVisible()
    await expect(page.getByText('全部在本地计算')).toBeVisible()
    await expect(page.locator('.metric-value').first()).toHaveText('—')
  })
})

test.describe('窄屏', () => {
  test('R. 320px 下收件/日程/月历/统计都不横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')

    const checkWidth = async () => {
      const size = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1)
    }

    await checkWidth()
    const nav = page.getByRole('navigation', { name: '主视图' })
    for (const label of [/^日程/, /^月历/, /^统计/]) {
      await nav.getByRole('button', { name: label }).click()
      await checkWidth()
    }
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

    // 分享目标：GET + title/text/url 三个参数（Chrome/Android 生效；iOS 不支持，见 README）
    const withShare = manifest as typeof manifest & { share_target?: { method?: string; params?: Record<string, string> } }
    expect(withShare.share_target?.method).toBe('GET')
    expect(withShare.share_target?.params).toEqual({ title: 'title', text: 'text', url: 'url' })

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

test.describe('错误边界（armed 开关）', () => {
  test('D1.  armed 后出错误界面，点「重试」恢复', async ({ page }) => {
    await page.goto('/?__boom=1')
    await expect(page.getByRole('alert')).toContainText('界面出了点问题')
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await page.getByRole('button', { name: '重试' }).click()
    await expect(page.getByRole('heading', { name: '拾穗' })).toBeVisible()
  })

  test('D2. 错误界面点「回首页」后正常', async ({ page }) => {
    await page.goto('/?__boom=1')
    await expect(page.getByRole('alert')).toContainText('界面出了点问题')
    await page.getByRole('button', { name: '回首页' }).click()
    await expect(page.getByRole('heading', { name: '拾穗' })).toBeVisible()
  })
})
test.describe('重复任务', () => {
  test('S. 每周任务：收录后显示规则；完成后生成下一次', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('群消息原文').fill('每周五9点项目例会')
    await page.getByRole('button', { name: '开始解析' }).click()
    await expect(page.getByRole('heading', { name: /识别到 \d+ 条待办/ })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '全部收录' }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.locator('.series-tag')).toBeVisible()

    // 完成一次 → 自动生成下一次（已完成进折叠区）
    await page.getByRole('button', { name: '标记为已完成' }).first().click()
    await expect(page.getByText(/已完成 1 件/)).toBeVisible({ timeout: 15_000 })
    // 完成后的下一条也带重复标记（已完成那条在折叠区，仍在 DOM 里）
    await expect(page.locator('.series-tag').first()).toBeVisible()

    // 幂等：完成 → 取消 → 再完成，下一条不会被生成两次
    await page.locator('.done-block summary').click()
    await page.getByRole('button', { name: '标记为未完成' }).first().click()
    await expect(page.getByText(/已完成 \d+ 件/)).toHaveCount(0)
    await page.getByRole('button', { name: '标记为已完成' }).first().click()
    await expect(page.getByText(/已完成 1 件/)).toBeVisible()
    // 只有一条未完成的下一条，没有翻倍
    await expect(page.locator('.task-row:not(.is-done)')).toHaveCount(1)
  })
})

test.describe('多日区间', () => {
  const ICS_MULTI = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:multi-day@example.com',
    'SUMMARY:三天活动',
    'DTSTART;VALUE=DATE:20261120',
    'DTEND;VALUE=DATE:20261123',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')

  test('T. 导入多日全天：日程显示区间，月历覆盖每一天', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '导入 .ics' }).click()
    await page.locator('.ics-import input[type="file"]').setInputFiles({
      name: 'multi.ics',
      mimeType: 'text/calendar',
      buffer: Buffer.from(ICS_MULTI, 'utf-8'),
    })
    await expect(page.getByText(/新增 1 \/ 更新 0/)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '确认导入' }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByText(/三天活动/)).toBeVisible()
    await expect(page.getByText(/3 天/)).toBeVisible()

    await nav.getByRole('button', { name: /^月历/ }).click()
    const day = (d: number) => new Date(2026, 10, d).getTime()
    for (const d of [20, 21, 22]) {
      await expect(page.locator(`.month-cell[data-day="${day(d)}"] .month-dot`)).toHaveCount(1)
    }
    await expect(page.locator(`.month-cell[data-day="${day(23)}"] .month-dot`)).toHaveCount(0)
  })
})

test.describe('DB v2 → v3 迁移', () => {
  test('U. 老库自动升级：旧任务保留、新字段补默认值', async ({ page }) => {
    // 先在同源下造一个 v2 老库（不加载应用，避免提前升级）
    await page.goto('/manifest.webmanifest')
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('shisui')
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
        req.onblocked = () => resolve()
      })
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('shisui', 2)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('tasks')) {
            const tasks = db.createObjectStore('tasks', { keyPath: 'id' })
            for (const idx of ['dueAt', 'startAt', 'done', 'kind', 'createdAt', 'sourceUid']) {
              tasks.createIndex(idx, idx)
            }
          }
          if (!db.objectStoreNames.contains('batches')) db.createObjectStore('batches', { keyPath: 'id' })
        }
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('tasks', 'readwrite')
          const store = tx.objectStore('tasks')
          const midnight = new Date(2026, 10, 20, 0, 0, 0, 0).getTime()
          store.put({
            id: 'old_all_day',
            title: '老全天任务',
            dueAt: midnight,
            startAt: null,
            kind: 'task',
            channel: null,
            location: null,
            rawText: 'x',
            confidence: 'high',
            reasons: [],
            engine: 'rule',
            createdAt: 1,
            done: false,
            editedFields: [],
          })
          store.put({
            id: 'old_timed',
            title: '老定时任务',
            dueAt: new Date(2026, 11, 1, 9, 0, 0, 0).getTime(),
            startAt: null,
            kind: 'task',
            channel: null,
            location: null,
            rawText: 'y',
            confidence: 'high',
            reasons: [],
            engine: 'rule',
            createdAt: 1,
            done: true,
            editedFields: [],
          })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      })
    })

    // 打开应用 → Dexie 自动升级到 v3
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '拾穗' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByText('老全天任务')).toBeVisible()

    const record = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('shisui')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const version = db.version
      const tx = db.transaction('tasks', 'readonly')
      const store = tx.objectStore('tasks')
      const get = (id: string) =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const req = store.get(id)
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })
      const all = await get('old_all_day')
      const timed = await get('old_timed')
      db.close()
      return { version, all, timed }
    })

    // Dexie 内部把声明版本 ×10 存进 IndexedDB（4 → 40）
    expect(record.version).toBe(40)
    expect(record.all.title).toBe('老全天任务')
    expect(record.all.allDay).toBe(true)
    expect(record.all.endAt).toBeNull()
    expect(record.all.recurrenceIndex).toBe(0)
    expect(record.all.skipped).toBe(false)
    expect(record.timed.done).toBe(true)
    expect(record.timed.allDay).toBe(false)
    expect(record.all.url).toBeNull()
    expect(record.all.note).toBeNull()
  })
})

test.describe('跨月区间', () => {
  const ICS_CROSS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:cross-month@example.com',
    'SUMMARY:跨月项目',
    'DTSTART;VALUE=DATE:20261120',
    'DTEND;VALUE=DATE:20261203',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')

  test('V. 20 日 → 次月 2 日：列表显示区间、月历两个月都有标记', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '导入 .ics' }).click()
    await page.locator('.ics-import input[type="file"]').setInputFiles({
      name: 'cross.ics',
      mimeType: 'text/calendar',
      buffer: Buffer.from(ICS_CROSS, 'utf-8'),
    })
    await expect(page.getByText(/新增 1 \/ 更新 0/)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '确认导入' }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByText(/11月20日–12月2日（13 天）/)).toBeVisible()

    await nav.getByRole('button', { name: /^月历/ }).click()
    const day = (m: number, d: number) => new Date(2026, m - 1, d).getTime()
    // 11 月格：20 日、30 日有标记
    await expect(page.locator(`.month-cell[data-day="${day(11, 20)}"] .month-dot`)).toHaveCount(1)
    await expect(page.locator(`.month-cell[data-day="${day(11, 30)}"] .month-dot`)).toHaveCount(1)
    // 12 月前两格（在 11 月网格里是下月格）也有标记
    await expect(page.locator(`.month-cell[data-day="${day(12, 1)}"] .month-dot`)).toHaveCount(1)
    await expect(page.locator(`.month-cell[data-day="${day(12, 2)}"] .month-dot`)).toHaveCount(1)
    await expect(page.locator(`.month-cell[data-day="${day(12, 3)}"] .month-dot`)).toHaveCount(0)
  })
})

test.describe('跳过这一次', () => {
  test('W. 跳过：标 skipped、生成下一条、不记为完成', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('群消息原文').fill('每周五9点项目例会')
    await page.getByRole('button', { name: '开始解析' }).click()
    await expect(page.getByRole('heading', { name: /识别到 \d+ 条待办/ })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '全部收录' }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.locator('.series-tag').first()).toBeVisible()

    await page.getByRole('button', { name: '跳过这一次' }).first().click()
    await expect(page.locator('.skipped-tag').first()).toBeVisible()
    // 跳过后：被跳过的那条 + 新生成的下一条，共 2 行带重复标记
    await expect(page.locator('.series-tag')).toHaveCount(2)
    // 跳过不等于完成
    await expect(page.getByText(/已完成 1 件/)).toHaveCount(0)
  })
})


test.describe('结束重复', () => {
  test('X. 结束系列：不再生成下一条，历史保留', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('群消息原文').fill('每周五9点项目例会')
    await page.getByRole('button', { name: '开始解析' }).click()
    await expect(page.getByRole('heading', { name: /识别到 \d+ 条待办/ })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '全部收录' }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.locator('.series-tag').first()).toBeVisible()

    await page.getByRole('button', { name: '结束重复' }).first().click()
    // 结束后再完成：不生成下一条
    await page.getByRole('button', { name: '标记为已完成' }).first().click()
    await expect(page.getByText(/已完成 1 件/)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.task-row:not(.is-done)')).toHaveCount(0)
  })
})

test.describe('多日区间整段拖拽', () => {
  const ICS_SPAN = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:span-drag@example.com',
    'SUMMARY:跨天项目',
    'DTSTART:20261120T010000Z',
    'DTEND:20261122T030000Z',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')

  test('Y. 整段拖拽 20→22：区间整体平移、长度不变', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '导入 .ics' }).click()
    await page.locator('.ics-import input[type="file"]').setInputFiles({
      name: 'span.ics',
      mimeType: 'text/calendar',
      buffer: Buffer.from(ICS_SPAN, 'utf-8'),
    })
    await expect(page.getByText(/新增 1 \/ 更新 0/)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '确认导入' }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^月历/ }).click()

    const day = (d: number) => new Date(2026, 10, d).getTime()
    const targetCell = page.locator(`.month-cell[data-day="${day(22)}"]`)
    await expect(targetCell).toHaveCount(1)
    // 月历格子里只有圆点；任务列表在下方「当天」面板，先选中 20 日再拖
    await page.locator(`.month-cell[data-day="${day(20)}"]`).click()
    const source = page.locator('.month-day .day-task', { hasText: '跨天项目' }).first()
    await expect(source).toBeVisible()
    await source.dragTo(targetCell)

    await nav.getByRole('button', { name: /^日程/ }).click()
    // 起点 20 日 09:00 → 22 日 09:00；终点 22 日 11:00 → 24 日 11:00，长度不变（3 个日历日）
    await expect(page.getByText(/11月22日–11月24日（3 天）/)).toBeVisible()
  })
})


test.describe('v0.9 备份 / 恢复', () => {
  test('Z1. 导出 JSON → 新增数据 → 恢复：回到备份状态', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '手动添加' }).click()
    await page.getByLabel('标题').fill('备份里的任务')
    await page.getByRole('button', { name: '添加', exact: true }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^设置/ }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 JSON 备份' }).click()
    const download = await downloadPromise
    const path = await download.path()
    expect(path).not.toBeNull()
    const backupText = readFileSync(path!, 'utf-8')
    const backup = JSON.parse(backupText)
    expect(backup.format).toBe('shisui-backup')
    expect(backup.tasks.length).toBe(1)

    // 备份后新增一条，再恢复 → 新增的应该消失
    await nav.getByRole('button', { name: /^收件/ }).click()
    await page.getByRole('button', { name: '手动添加' }).click()
    await page.getByLabel('标题').fill('备份后新增')
    await page.getByRole('button', { name: '添加', exact: true }).click()

    await nav.getByRole('button', { name: /^设置/ }).click()
    await page.locator('input[type="file"][accept*="json"]').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backupText, 'utf-8'),
    })
    await expect(page.getByRole('region', { name: '恢复预览' })).toContainText('1 条任务')
    await page.getByRole('button', { name: '确认恢复' }).click()
    await expect(page.getByText(/已恢复 1 条任务/)).toBeVisible()

    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByText('备份里的任务')).toBeVisible()
    await expect(page.getByText('备份后新增')).toHaveCount(0)
  })

  test('Z2. 非法备份文件：给出错误、不改数据', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '手动添加' }).click()
    await page.getByLabel('标题').fill('不能丢的任务')
    await page.getByRole('button', { name: '添加', exact: true }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^设置/ }).click()
    await page.locator('input[type="file"][accept*="json"]').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"format":"shisui-backup","tasks":[', 'utf-8'),
    })
    await expect(page.getByRole('alert')).toContainText('不完整')
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByText('不能丢的任务')).toBeVisible()
  })
})

test.describe('v0.9 标签 / 搜索', () => {
  test('Z3. 加标签后 #标签 搜索', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '手动添加' }).click()
    await page.getByLabel('标题').fill('复习数学')
    await page.getByRole('button', { name: '添加', exact: true }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await page.getByRole('button', { name: '＋标签' }).click()
    await page.getByLabel('新标签').fill('作业')
    await page.getByLabel('新标签').press('Enter')
    await expect(page.getByText('#作业')).toBeVisible()

    const search = page.getByLabel('搜索任务')
    await search.fill('#作业')
    await expect(page.getByText('复习数学')).toBeVisible()
    await search.fill('#不存在')
    await expect(page.getByText('复习数学')).toHaveCount(0)
  })
})

test.describe('v0.9 批量 / 撤销', () => {
  test('Z4. 批量完成 → 撤销恢复', async ({ page }) => {
    await page.goto('/')
    for (const title of ['批量甲', '批量乙']) {
      await page.getByRole('button', { name: '手动添加' }).click()
      await page.getByLabel('标题').fill(title)
      await page.getByRole('button', { name: '添加', exact: true }).click()
    }

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await page.getByRole('button', { name: '多选' }).click()
    await page.getByLabel('选择「批量甲」').check()
    await page.getByLabel('选择「批量乙」').check()
    await page.getByRole('button', { name: '批量完成' }).click()
    await expect(page.getByText(/已完成 2 件/)).toBeVisible()

    await page.getByRole('button', { name: /撤销「批量完成 2 件」/ }).click()
    await expect(page.getByText(/已完成 \d+ 件/)).toHaveCount(0)
    await expect(page.locator('.task-row', { hasText: '批量甲' })).toBeVisible()
  })
})

test.describe('v0.9 专注模式', () => {
  test('Z5. 专注完成重复任务：生成下一条，不丢数据', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('群消息原文').fill('每周五9点项目例会')
    await page.getByRole('button', { name: '开始解析' }).click()
    await expect(page.getByRole('heading', { name: /识别到 \d+ 条待办/ })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '全部收录' }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await page.getByRole('button', { name: '专注模式' }).click()
    const focus = page.getByRole('region', { name: '专注模式' })
    await expect(focus).toContainText('项目例会')
    await expect(focus).toContainText('1 / 1')

    await focus.getByRole('button', { name: '完成', exact: true }).click()
    await expect(focus).toContainText('1 / 1') // 生成的下一条仍在专注里
    await expect(page.getByText(/已完成 1 件/)).toBeVisible()
  })
})


test.describe('v0.10 系列编辑', () => {
  test('Z6. 改整个系列：当前实例与 series 同步更新', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('群消息原文').fill('每周五9点项目例会')
    await page.getByRole('button', { name: '开始解析' }).click()
    await expect(page.getByRole('heading', { name: /识别到 \d+ 条待办/ })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '全部收录' }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await page.getByRole('button', { name: '编辑任务' }).first().click()

    // 先记下 once 模式下的日期部分
    const originalDate = (await page.getByLabel('编辑时间').inputValue()).slice(0, 10)

    await page.getByLabel('编辑标题').fill('改名后的例会')
    await page.getByLabel('改整个系列（当前 + 未来未完成）').check()
    // series 模式只能改时刻，不能改日期
    await expect(page.getByLabel('编辑时间', { exact: true })).toHaveCount(0)
    const clockInput = page.getByLabel('编辑时间（只改时刻）')
    await expect(clockInput).toBeVisible()
    await clockInput.fill('10:30')
    // 二次确认文案：明确将同步的未完成实例条数
    await expect(page.getByText(/将同步 \d+ 个未完成实例/)).toBeVisible()
    await page.getByRole('button', { name: '保存' }).first().click()

    // 再打开一次：切回 once 模式时日期应保持原样
    await page.getByRole('button', { name: '编辑任务' }).first().click()
    const afterDate = (await page.getByLabel('编辑时间').inputValue()).slice(0, 10)
    expect(afterDate).toBe(originalDate)

    await expect(page.locator('.task-row', { hasText: '改名后的例会' })).toBeVisible()
  })

  test('Z7. 改这一次：普通任务只改当前标题', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '手动添加' }).click()
    await page.getByLabel('标题').fill('原名')
    await page.getByRole('button', { name: '添加', exact: true }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await page.getByRole('button', { name: '编辑任务' }).first().click()
    await page.getByLabel('编辑标题').fill('改后名')
    await page.getByRole('button', { name: '保存' }).first().click()

    await expect(page.locator('.task-row', { hasText: '改后名' })).toBeVisible()
    await expect(page.getByText('原名')).toHaveCount(0)
  })
})


test.describe('v0.10 加密备份', () => {
  test('Z8. 加密导出 → 错误密码拒绝 → 正确密码恢复', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '手动添加' }).click()
    await page.getByLabel('标题').fill('加密备份里的任务')
    await page.getByRole('button', { name: '添加', exact: true }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('checkbox', { name: /加密备份/ }).check()
    await page.getByLabel('备份密码', { exact: true }).fill('shisui-pass-123')
    await page.getByLabel('确认备份密码').fill('shisui-pass-123')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 JSON 备份' }).click()
    const download = await downloadPromise
    const path = await download.path()
    const encryptedText = readFileSync(path!, 'utf-8')
    const envelope = JSON.parse(encryptedText)
    expect(envelope.format).toBe('shisui-backup-encrypted')
    expect(envelope.encryptedVersion).toBe(1)
    expect(envelope.kdf.iterations).toBe(310000)

    // 错误密码：拒绝且不动数据
    await page.locator('input[type="file"][accept*="json"]').setInputFiles({
      name: 'backup-enc.json',
      mimeType: 'application/json',
      buffer: Buffer.from(encryptedText, 'utf-8'),
    })
    await expect(page.getByRole('region', { name: '加密备份解锁' })).toBeVisible()
    await page.getByLabel('解密密码').fill('wrong-pass-123')
    await page.getByRole('button', { name: '解密并预览' }).click()
    await expect(page.getByRole('alert')).toContainText('密码错误')

    // 正确密码：预览 → 恢复
    await page.getByLabel('解密密码').fill('shisui-pass-123')
    await page.getByRole('button', { name: '解密并预览' }).click()
    await expect(page.getByRole('region', { name: '恢复预览' })).toContainText('1 条任务')
    await page.getByRole('button', { name: '确认恢复' }).click()
    await expect(page.getByText(/已恢复 1 条任务/)).toBeVisible()
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByText('加密备份里的任务')).toBeVisible()
  })
})


test.describe('v0.10 iOS 剪贴板替代', () => {
  test('Z9. 粘贴分享内容：追加到输入末尾，不覆盖', async ({ page }) => {
    await page.goto('/')
    // 模拟 iOS 场景：剪贴板里有群消息，输入框已有内容
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: async () => '周一9点开会' },
      })
    })
    await page.getByLabel('群消息原文').fill('已有内容\n')

    await page.getByRole('button', { name: '粘贴分享内容' }).click()
    const value = await page.getByLabel('群消息原文').inputValue()
    // 精确等于：末尾已有换行时不重复补，只保留单个分隔换行
    expect(value).toBe('已有内容\n周一9点开会')
  })
})


test.describe('v1.0 使用说明', () => {
  test('H1. 首次访问提示条只出现一次', async ({ page }) => {
    await page.goto('/')
    const banner = page.locator('.first-visit')
    await expect(banner).toBeVisible()
    await page.getByRole('button', { name: '知道了' }).first().click()
    await expect(banner).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.first-visit')).toHaveCount(0)
  })

  test('H2. 怎么用：打开/Esc 关闭/焦点回按钮/aria；360px 不溢出', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('/')
    const trigger = page.getByRole('button', { name: '怎么用' })
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    await trigger.click()

    const dialog = page.getByRole('dialog', { name: '怎么用拾穗' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog).toContainText('粘贴群消息')
    await expect(dialog).toContainText('检查解析结果并收录')
    await expect(dialog).toContainText('去日程 / 月历')
    await expect(dialog).toContainText('不上传服务器')
    await expect(dialog).toContainText('iOS')

    // Esc 关闭，焦点回到触发按钮
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // 遮罩点击也关闭
    await trigger.click()
    await expect(dialog).toBeVisible()
    await page.locator('.help-overlay').click({ position: { x: 5, y: 5 } })
    await expect(dialog).toHaveCount(0)
  })
})


test.describe('v1.0 中英双语', () => {
  test('L1. 切换 English：导航/标题/html lang 同步，刷新保持，可切回', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('button', { name: 'English' }).click()

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('nav')).toContainText('Inbox')
    await expect(page.locator('nav')).toContainText('Settings')
    await expect(page.getByRole('heading', { name: 'Backup & restore' })).toBeVisible()
    expect(await page.title()).toContain('Shisui')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('nav')).toContainText('Inbox')
    await expect(page.locator('nav')).toContainText('Plan')
    // 刷新后默认回到收件页；重新进入设置再断言英文标题
    await page.locator('nav').getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Backup & restore' })).toBeVisible()

    await page.getByRole('button', { name: '中文' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.locator('nav')).toContainText('收件')
  })
})


test.describe('v1.0 English 静态 UI', () => {
  test('L2. manifest 切换 + English 页面无中文（含解析/候选/Plan 有数据）', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('button', { name: 'English' }).click()

    expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toContain('manifest.en.webmanifest')
    const manifest = await (await page.request.get('/manifest.en.webmanifest')).json()
    expect(manifest.lang).toBe('en')
    expect(manifest.name).toContain('group messages to to-dos')

    const scan = async () =>
      page.evaluate(() => {
        // 允许品牌「穗」与语言自称「中文」；用户内容/任务标题/reasons/ICS 警告不在扫描范围
        const allowed = /穗|中文/
        const skip = '.task-title,.candidate-title,.raw,.reasons,.warnings,.chips,.task-tags,.tag,.series-tag,.history-item,.task-meta,.conflicts,textarea,input,select,script,style'
        const hasCjk = (text: string) => /[\u4e00-\u9fff]/.test(text) && !allowed.test(text)
        const parts = new Set<string>()
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          if (el.closest(skip)) continue
          for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
              const value = (node.textContent ?? '').trim()
              if (value && hasCjk(value)) parts.add('text: ' + value)
            }
          }
          for (const attr of ['aria-label', 'placeholder', 'title']) {
            const value = el.getAttribute(attr)
            if (value && hasCjk(value)) parts.add(`${attr}: ${value}`)
          }
        }
        return [...parts]
      })

    const found = new Set<string>()
    for (const label of ['Inbox', 'Calendar', 'Stats', 'Settings']) {
      await page.locator('nav').getByRole('button', { name: label }).click()
      await page.waitForTimeout(120)
      for (const item of await scan()) found.add(item)
    }

    // 动态：解析示例 → 候选页；收录 → Plan 有数据
    await page.locator('nav').getByRole('button', { name: 'Inbox' }).click()
    await page.getByRole('button', { name: 'Work example' }).click()
    await page.getByRole('button', { name: 'Parse', exact: true }).click()
    await expect(page.getByRole('heading', { name: /Found \d+ to-dos/ })).toBeVisible({ timeout: 15_000 })
    for (const item of await scan()) found.add(item)

    await page.getByRole('button', { name: 'Accept all' }).click()
    await page.locator('nav').getByRole('button', { name: 'Plan' }).click()
    await page.waitForTimeout(200)
    for (const item of await scan()) found.add(item)

    // 收录后回收件页：覆盖 toast「Accepted N to-dos…」
    await page.locator('nav').getByRole('button', { name: 'Inbox' }).click()
    await page.waitForTimeout(200)
    for (const item of await scan()) found.add(item)

    expect([...found]).toEqual([])
  })
})


test.describe('v1.1 签名彩蛋', () => {
  test('S1. 三击弹出 / 键盘打开 / Esc 关闭 + 焦点回落款 / 关闭按钮', async ({ page }) => {
    await page.goto('/')
    const button = page.locator('.signature-btn')
    await expect(button).toBeVisible()
    await expect(button).toContainText('dream-office')
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(button).toHaveAttribute('aria-controls', 'signature-note')

    // 点 1 次、2 次都不弹
    await button.click()
    await expect(page.locator('.signature-line')).toHaveCount(0)
    await button.click()
    await expect(page.locator('.signature-line')).toHaveCount(0)

    // 2 秒内第 3 次 → 弹出中文一句话
    await button.click()
    const line = page.locator('.signature-line')
    await expect(line).toBeVisible()
    await expect(line).toContainText('把散落的时间，一粒一粒捡起来。')
    await expect(line).toHaveAttribute('role', 'dialog')
    await expect(line).toHaveAttribute('aria-modal', 'false')
    await expect(button).toHaveAttribute('aria-expanded', 'true')

    // Esc 关闭，焦点回按钮
    await page.keyboard.press('Escape')
    await expect(line).toHaveCount(0)
    await expect(button).toBeFocused()

    // 键盘 Enter 打开；关闭按钮关闭并回焦点
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(line).toBeVisible()
    await page.locator('.signature-close').click()
    await expect(line).toHaveCount(0)
    await expect(button).toBeFocused()
  })

  test('S2. 英文界面显示英文一句话', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('button', { name: 'English' }).click()
    const button = page.locator('.signature-btn')
    await button.click()
    await button.click()
    await button.click()
    await expect(page.locator('.signature-line')).toContainText(
      'Picking up the scattered moments, one grain at a time.',
    )
  })

  test('S3. 控制台签名只打一次；360px 不溢出', async ({ page }) => {
    const logs: string[] = []
    page.on('console', (msg) => logs.push(msg.text()))
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('/')
    await page.waitForTimeout(300)
    await page.locator('.signature-btn').click()
    await page.waitForTimeout(100)
    expect(logs.filter((text) => text.includes('dream-office')).length).toBe(1)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await expect(page.locator('.signature-btn')).toBeVisible()
  })
})


test.describe('v1.1.2 B 版空态与关于', () => {
  test('B1. 空态：Inbox / Plan / Calendar / Stats 有穗标记 + 文案 + 操作入口', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.sprig-mark').first()).toBeVisible()
    await expect(page.getByText('从一条群通知开始')).toBeVisible()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await expect(page.locator('.empty .sprig-mark')).toBeVisible()
    await expect(page.getByRole('heading', { name: '日程还是空的' })).toBeVisible()
    await expect(page.getByRole('button', { name: '去贴通知' })).toBeVisible()

    await nav.getByRole('button', { name: /^月历/ }).click()
    await expect(page.locator('.month-day-empty .sprig-mark')).toBeVisible()
    await expect(page.getByText('这一天先空着')).toBeVisible()
    await expect(page.locator('.month-day-empty').getByRole('button', { name: '去收件' })).toBeVisible()

    await nav.getByRole('button', { name: /^统计/ }).click()
    await expect(page.locator('.sprig-mark')).toBeVisible()
    await expect(page.getByText('还没有数据')).toBeVisible()
  })

  test('B2. 专注空态：完成最后一条后显示穗标记 + 退出入口', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '手动添加' }).click()
    await page.getByLabel('标题').fill('专注空态测试')
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    await page.locator('.manual input[type="datetime-local"]').fill(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T23:30`,
    )
    await page.getByRole('button', { name: '添加', exact: true }).click()

    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await page.getByRole('button', { name: '专注模式' }).click()
    await page.locator('.focus').getByRole('button', { name: '完成', exact: true }).click()
    await expect(page.locator('.focus .sprig-mark')).toBeVisible()
    await expect(page.getByText('今天先到这里')).toBeVisible()
    await expect(page.locator('.focus').getByRole('button', { name: '退出专注' })).toBeVisible()
  })

  test('B3. 关于块：版本/作者/签名/源码链接，中英双语', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^设置/ }).click()
    await expect(page.getByRole('heading', { name: '关于拾穗' })).toBeVisible()
    const about = page.locator('.about-signature')
    await expect(page.getByText('拾穗 v1.3.0 · AGPL-3.0-or-later')).toBeVisible()
    await expect(page.getByText('作者：dream-office')).toBeVisible()
    await expect(about).toContainText('dream-office · 把散落的时间，一粒一粒捡起来。')
    await expect(page.getByRole('link', { name: '源码（GitHub）' })).toHaveAttribute(
      'href', 'https://github.com/dream-office/shisui',
    )

    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.getByText('Author: dream-office')).toBeVisible()
    await expect(about).toContainText('Picking up the scattered moments, one grain at a time.')
    await expect(page.getByRole('link', { name: 'Source (GitHub)' })).toBeVisible()
    await expect(page.getByText('no upload. The only network call', { exact: false })).toBeVisible()
  })

  test('B4. reduced-motion 关闭动效；320/360 不溢出', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^日程/ }).click()
    const animation = await page.locator('.empty .empty-state').evaluate(
      (el) => getComputedStyle(el).animationName,
    )
    expect(animation).toBe('none')

    // 普通动效时应为 rise-in
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.waitForTimeout(250)
    const animated = await page.locator('.empty .empty-state').evaluate(
      (el) => getComputedStyle(el).animationName,
    )
    expect(animated).toBe('rise-in')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await expect(page.locator('.empty .sprig-mark')).toBeVisible()

    await page.setViewportSize({ width: 360, height: 760 })
    const overflow360 = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow360).toBeLessThanOrEqual(1)
  })
})


test.describe('v1.2 结构化多事项 + DB v4', () => {
  const COMPETITION = `关于组织参加大学生竞赛的通知
各学院：
一、WPS 智能办公能力挑战赛（校赛）
报名/考试链接：https://f.kdocs.cn/g/BcUkkscR/
考试时间：2026年11月5日9:00-11月8日22:00
二、AI 创新应用挑战赛（校赛）
链接：https://f.kdocs.cn/g/rPtGIP9T/
考试时间：2026年11月5日9:00-11月8日22:00
三、程序设计（校赛）
考试时间：2026年11月5日14:30-2026年11月5日16:00
链接 11 月 4 日 16:00 后更新
温馨提示：进入链接需填写官网报名信息（UID、姓名、手机号等），信息必须与官网保持一致；未在官网报名的学生，请在赛前完成账号注册，获取 UID。
免费参与，获奖率高，简历添彩，评综测加分，祝取得好成绩！`

  test('T1. 一条通知三赛道 → 3 条候选；每条链接/备注；收录后日程可见', async ({ page }) => {
    await page.goto('/')
    await page.locator('textarea').fill(COMPETITION)
    await page.getByRole('button', { name: '开始解析' }).click()

    await expect(page.locator('.candidate')).toHaveCount(3, { timeout: 15_000 })
    await expect(page.locator('.candidate .task-link')).toHaveCount(2)
    await expect(page.locator('.candidate .task-note')).toHaveCount(3)
    await expect(page.locator('.candidate').first()).toContainText('WPS 智能办公能力挑战赛')
    await expect(page.locator('.candidate').first().locator('.task-link')).toHaveAttribute(
      'href',
      'https://f.kdocs.cn/g/BcUkkscR/',
    )

    await page.getByRole('button', { name: '全部收录' }).click()
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^日程/ }).click()
    await expect(page.locator('.task-link')).toHaveCount(2)
    await expect(page.locator('.task-note')).toHaveCount(3)
    await page.locator('.task-note summary').first().click()
    await expect(page.getByText('进入链接需填写官网报名信息', { exact: false }).first()).toBeVisible()
  })

  test('T2. DB v3 → v4 迁移：旧任务保留，url/note 补 null', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const del = indexedDB.deleteDatabase('shisui')
        del.onsuccess = () => resolve()
        del.onerror = () => reject(del.error)
      })
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('shisui', 3)
        open.onupgradeneeded = () => {
          const db = open.result
          db.createObjectStore('tasks', { keyPath: 'id' })
          db.createObjectStore('batches', { keyPath: 'id' })
          db.createObjectStore('series', { keyPath: 'id' })
        }
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('tasks', 'readwrite')
          tx.objectStore('tasks').put({
            id: 'old-v3',
            title: '旧版任务',
            dueAt: Date.now() + 86_400_000,
            startAt: null,
            kind: 'task',
            channel: null,
            location: null,
            rawText: '',
            confidence: 'high',
            reasons: [],
            engine: 'rule',
            createdAt: Date.now(),
            done: false,
            editedFields: [],
            endAt: null,
            allDay: false,
            rrule: null,
            seriesId: null,
            recurrenceIndex: 0,
            skipped: false,
          })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
        open.onerror = () => reject(open.error)
      })
    })
    await page.reload()
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^日程/ }).click()
    await expect(page.getByText('旧版任务')).toBeVisible()

    const migrated = await page.evaluate(
      () =>
        new Promise<{ url: string | null; note: string | null }>((resolve, reject) => {
          const open = indexedDB.open('shisui')
          open.onsuccess = () => {
            const db = open.result
            const req = db.transaction('tasks').objectStore('tasks').get('old-v3')
            req.onsuccess = () => resolve({ url: req.result.url ?? null, note: req.result.note ?? null })
            req.onerror = () => reject(req.error)
          }
          open.onerror = () => reject(open.error)
        }),
    )
    expect(migrated.url).toBeNull()
    expect(migrated.note).toBeNull()
  })
})


test.describe('v1.2.0 导航布局', () => {
  test('N1. 800/820/860/861：5 个标签单行、无横向滚动；1920 不变', async ({ page }) => {
    for (const width of [800, 820, 860, 861, 1920]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      const tabs = page.locator('.tab')
      await expect(tabs).toHaveCount(5)
      const allSingleLine = await tabs.evaluateAll((els) =>
        els.every((el) => el.scrollHeight <= el.clientHeight + 1 && getComputedStyle(el).whiteSpace === 'nowrap'),
      )
      expect(allSingleLine, `width=${width}`).toBe(true)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `width=${width}`).toBeLessThanOrEqual(1)
      await expect(page.getByRole('navigation', { name: '主视图' })).toBeVisible()
    }
  })
})
