
import { expect, test } from '@playwright/test'

test.describe('v1.3.1 收件工具栏', () => {
  test('M1. 外排 5 个 + 更多；示例/导入不在外排', async ({ page }) => {
    await page.goto('/')
    const actions = page.locator('.composer-actions > button')
    await expect(actions).toHaveCount(5) // 外排 5 个功能
    const texts = await actions.allInnerTexts()
    expect(texts[0]).toContain('开始解析')
    expect(texts[1]).toContain('粘贴分享内容')
    expect(texts[2]).toContain('清空')
    expect(texts[3]).toContain('手动添加')
    expect(texts[4]).toMatch(/^历史/)

    const more = page.locator('.more-wrap > button')
    await expect(more).toHaveText(/更多/)
    await expect(more).toHaveAttribute('aria-haspopup', 'menu')
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    for (const item of ['工作群示例', '学校通知示例', '导入 .ics', '导入文档', '识别图片']) {
      await expect(menu.getByRole('menuitem', { name: item })).toBeVisible()
    }
    await expect(menu).toContainText('PDF / DOCX / TXT / MD · 图片 png/jpg/webp')
    // 菜单项不在外排按钮里
    await expect(page.locator('.composer-actions > button', { hasText: '工作群示例' })).toHaveCount(0)
  })

  test('M2. Esc / 点外部关闭；示例与导入入口行为不变', async ({ page }) => {
    await page.goto('/')
    const more = page.getByRole('button', { name: '更多 ▾' })
    await more.click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(more).toBeFocused()

    await more.click()
    await page.locator('.hero h2').click()
    await expect(page.getByRole('menu')).toHaveCount(0)

    await more.click()
    await page.getByRole('menuitem', { name: '工作群示例' }).click()
    await expect(page.locator('textarea')).not.toHaveValue('')
    await expect(page.getByRole('menu')).toHaveCount(0)

    await more.click()
    await page.getByRole('menuitem', { name: '导入 .ics' }).click()
    await expect(page.locator('.ics-import')).toBeVisible()
  })

  test('M3. 多视口：菜单完整在 viewport 内，「识别图片」可点击', async ({ page }) => {
    for (const [width, height] of [
      [1280, 900],
      [1024, 768],
      [800, 600],
      [360, 640],
      [320, 568],
    ]) {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await page.getByRole('button', { name: '更多 ▾' }).click()
      const menu = page.getByRole('menu')
      await expect(menu).toBeVisible()
      const box = await menu.boundingBox()
      expect(box, `${width}x${height}`).not.toBeNull()
      expect(box!.y, `${width}x${height} top`).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height, `${width}x${height} bottom`).toBeLessThanOrEqual(height + 1)
      expect(box!.x, `${width}x${height} left`).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width, `${width}x${height} right`).toBeLessThanOrEqual(width + 1)

      const last = page.getByRole('menuitem', { name: '识别图片' })
      await expect(last).toBeVisible()
      await expect(last).toBeEnabled()
      const fileChooser = page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null)
      await last.click()
      expect(await fileChooser, `${width}x${height} file chooser`).not.toBeNull()
      await expect(page.getByRole('menu')).toHaveCount(0)
    }
  })
})
