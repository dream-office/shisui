
import { expect, test, type Page } from '@playwright/test'

async function seedAndOpenStats(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '更多 ▾' }).click()
  await page.getByRole('menuitem', { name: '工作群示例' }).click()
  await page.getByRole('button', { name: '开始解析' }).click()
  await expect(page.getByRole('heading', { name: /识别到 \d+ 条待办/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: '全部收录' }).click()
  await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^统计/ }).click()
}

test.describe('v1.6 统计页', () => {
  test('S1. 8 周趋势/类型分布/每日专注/口径/导出可用，320 不溢出', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await seedAndOpenStats(page)
    await expect(page.getByRole('heading', { name: '8 周完成趋势' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '按任务类型分布' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '每日专注趋势' })).toBeVisible()
    await expect(page.locator('.trend-col')).toHaveCount(8)
    await expect(page.locator('.methodology')).toContainText('统计口径说明')

    const csv = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 CSV' }).click()
    expect((await csv).suggestedFilename()).toMatch(/\.csv$/)
    const png = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 PNG' }).click()
    expect((await png).suggestedFilename()).toMatch(/\.png$/)

    await page.setViewportSize({ width: 320, height: 720 })
    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1)
  })

  test('S2. pagehide 落一条专注记录，统计页可见；<30s 文案存在', async ({ page }) => {
    await seedAndOpenStats(page)
    const nav = page.getByRole('navigation', { name: '主视图' })
    await nav.getByRole('button', { name: /^日程/ }).click()
    await page.getByRole('button', { name: '专注模式' }).click()
    await expect(page.locator('.focus')).toBeVisible()
    await expect(page.locator('.focus-hint')).toContainText('30 秒')
    await page.waitForFunction(() => window.sessionStorage.getItem('shisui.focus.active') !== null)
    // 切走 <30s：不结算（visibilitychange hidden 后马上回来）
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(200)
    const before = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('shisui.focus.sessions') ?? '[]'),
    )
    expect(Array.isArray(before) ? before.length : 0).toBe(0)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
      const raw = window.sessionStorage.getItem('shisui.focus.active')
      if (!raw) throw new Error('focus not started')
      const active = JSON.parse(raw) as { startedAt: number; loadId: string }
      active.startedAt -= 90_000
      window.sessionStorage.setItem('shisui.focus.active', JSON.stringify(active))
      window.dispatchEvent(new Event('pagehide'))
    })
    const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('shisui.focus.sessions') ?? '[]'))
    expect(Array.isArray(stored) && stored.length).toBeGreaterThan(0)
    await nav.getByRole('button', { name: /^统计/ }).click()
    await expect(page.locator('.metric').filter({ hasText: '近 7 天专注' }).locator('.metric-value')).not.toHaveText('—')
    await expect(page.locator('.focus-col')).toHaveCount(7)
  })

  test('S3. English 统计页无中文统计标签', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('button', { name: 'English' }).click()
    await page.getByRole('navigation', { name: /主视图|Main views/ }).first().getByRole('button', { name: 'Stats' }).click()
    await expect(page.getByRole('heading', { name: '8-week completion trend' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Daily focus trend' })).toBeVisible()
    const text = await page.locator('.stats-view').innerText()
    expect(text).not.toMatch(/8 周完成趋势|按任务类型分布|每日专注趋势|统计口径说明|延期完成率/)
  })
})
