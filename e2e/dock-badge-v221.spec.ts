import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v2.2.1')
test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

test('v2.2.1 dock 角标：绝对定位图标右上，不挤占布局，选中/未选中正常', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 320] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await page.getByRole('button', { name: '更多 ▾' }).click()
      await page.getByRole('menuitem', { name: '工作群示例' }).click()
      await page.getByRole('button', { name: '开始解析' }).click()
      await page.getByRole('heading', { name: /识别到 \d+ 条待办/ }).waitFor()
      await page.getByRole('button', { name: '全部收录' }).click()
      await expect(page.getByText(/已收录 \d+ 条/)).toBeVisible()

      const item = page.locator('.dock-item').filter({ hasText: '日程' })
      await expect(item.locator('.tab-badge')).toBeVisible()
      await item.click()
      const metrics = await item.evaluate((el) => {
        const badge = el.querySelector('.tab-badge') as HTMLElement
        const icon = el.querySelector('.nav-icon') as SVGElement
        const itemRect = el.getBoundingClientRect()
        const badgeRect = badge.getBoundingClientRect()
        const iconRect = icon.getBoundingClientRect()
        const slot = el.parentElement!.querySelector('.dock-item') as HTMLElement
        return {
          position: getComputedStyle(badge).position,
          itemHeight: itemRect.height,
          itemWidth: itemRect.width,
          slotWidth: slot.getBoundingClientRect().width,
          badgeTop: badgeRect.top - itemRect.top,
          badgeBottom: badgeRect.bottom,
          itemBottom: itemRect.bottom,
          badgeLeft: badgeRect.left,
          itemLeft: itemRect.left,
          itemCenter: itemRect.left + itemRect.width / 2,
          badgeRight: badgeRect.right,
          itemRight: itemRect.right,
          badgeWidth: badgeRect.width,
          badgeHeight: badgeRect.height,
          iconTop: iconRect.top,
          iconCenterY: iconRect.top + iconRect.height / 2,
        }
      })
      expect(metrics.position).toBe('absolute')
      expect(metrics.itemHeight).toBe(50)
      expect(metrics.itemWidth).toBeCloseTo(metrics.slotWidth, 0)
      expect(metrics.badgeTop).toBeCloseTo(3, 0)
      expect(metrics.badgeLeft).toBeGreaterThanOrEqual(metrics.itemCenter)
      expect(metrics.badgeRight).toBeLessThanOrEqual(metrics.itemRight)
      expect(metrics.badgeWidth).toBeGreaterThanOrEqual(16)
      expect(metrics.badgeHeight).toBe(16)
      // 角标在上半部、不压标签
      expect(metrics.badgeTop).toBeLessThan(metrics.iconCenterY)
      expect(metrics.badgeBottom).toBeLessThan(metrics.itemBottom - 10)
      await page.screenshot({ path: join(OUT, `badge-${theme}-${width}-selected.png`), fullPage: false })

      await page.locator('.dock-item').filter({ hasText: '收件' }).click()
      await page.waitForTimeout(150)
      await page.screenshot({ path: join(OUT, `badge-${theme}-${width}-idle.png`), fullPage: false })
      await expect(item.locator('.tab-badge')).toBeVisible()
    }
  }
})
