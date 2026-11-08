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
    await page.locator('input[type="file"]').setInputFiles({
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

    await page.getByRole('button', { name: '知道了' }).click()
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
    await expect(moved).toContainText('18:00')
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
    await expect(dayCard).toContainText('12月1日')
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
    await page.locator('input[type="file"]').setInputFiles({
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

    // Dexie 内部把声明版本 ×10 存进 IndexedDB（3 → 30）
    expect(record.version).toBe(30)
    expect(record.all.title).toBe('老全天任务')
    expect(record.all.allDay).toBe(true)
    expect(record.all.endAt).toBeNull()
    expect(record.all.recurrenceIndex).toBe(0)
    expect(record.all.skipped).toBe(false)
    expect(record.timed.done).toBe(true)
    expect(record.timed.allDay).toBe(false)
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
    await page.locator('input[type="file"]').setInputFiles({
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
    await page.locator('input[type="file"]').setInputFiles({
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

    await page.getByLabel('编辑标题').fill('改名后的例会')
    await page.getByLabel('改整个系列（当前 + 未来未完成）').check()
    await page.getByRole('button', { name: '保存' }).first().click()

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
