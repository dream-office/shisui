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
