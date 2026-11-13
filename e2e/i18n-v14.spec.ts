
import { expect, test, type Page } from '@playwright/test'

async function toEnglish(page: Page) {
  await page.goto('/')
  await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
  await page.getByRole('radio', { name: 'English' }).click()
}

const CORE_ZH = /命中|时间短语|重复规则|提交渠道|时间与类型|结构基本清楚|信息不足|双引擎一致|规则引擎未命中|时间重叠|已经过期|几乎同时截止|这一天堆了|无法识别|没有开始时间|不支持|不是拾穗备份|备份文件不完整/

test.describe('v1.4 core 动态文本英文', () => {
  test('E1. English 解析 reasons 不出现 core 中文', async ({ page }) => {
    await toEnglish(page)
    await page.getByRole('navigation', { name: /主视图|Main views/ }).first().getByRole('button', { name: 'Inbox' }).click()
    await page.getByRole('button', { name: 'More ▾' }).click()
    await page.getByRole('menuitem', { name: 'Work example' }).click()
    await page.getByRole('button', { name: 'Parse', exact: true }).click()
    await expect(page.getByRole('heading', { name: /Found \d+ to-dos/ })).toBeVisible({ timeout: 15_000 })

    const details = page.locator('details.reasons').first()
    await details.locator('summary').click()
    const reasons = await details.locator('li').allInnerTexts()
    expect(reasons.length).toBeGreaterThan(0)
    for (const reason of reasons) {
      expect(reason, reason).not.toMatch(CORE_ZH)
    }
    expect(reasons.join(' ')).toMatch(/Matched|Recurring|Channel|deadline|clear|check|Time phrase/i)
  })

  test('E2. English 备份错误、冲突提示、ICS warning 均为英文', async ({ page }) => {
    await toEnglish(page)
    const settingsNav = page.getByRole('navigation', { name: /主视图|Main views/ }).first().getByRole('button', { name: 'Settings' })
    const fileInput = page.locator('input[type="file"][accept*="json"]')

    // 备份错误
    await fileInput.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('not json') })
    const restoreError = page.locator('.import-error[role="alert"]')
    await expect(restoreError).toContainText('Not a valid JSON file')
    await expect(restoreError).toHaveClass(/inline-alert/)
    const errStyle = await restoreError.evaluate((el) => {
      const s = getComputedStyle(el)
      return { radius: s.borderRadius, padding: s.padding }
    })
    expect(errStyle.radius).toBe('12px')
    expect(errStyle.padding).toBe('10px 12px')

    // 合法备份 → 冲突提示
    const base = Date.now() + 2 * 60 * 60_000
    const task = (id: string, title: string) => ({
      id, title, dueAt: base, startAt: base, endAt: base + 60 * 60_000,
      createdAt: Date.now(), allDay: false, rrule: null, seriesId: null,
      recurrenceIndex: 0, skipped: false, tags: [], kind: 'task', channel: null,
      location: null, url: null, note: null, rawText: '', confidence: 'high',
      reasons: ['imported'], engine: 'import', done: false, editedFields: [], sourceUid: null,
    })
    const backup = {
      format: 'shisui-backup', backupVersion: 1, schemaVersion: 4,
      exportedAt: new Date().toISOString(), appVersion: '1.4.0',
      tasks: [task('a', 'Alpha'), task('b', 'Beta')], series: [], batches: [], settings: {},
    }
    await fileInput.setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await page.getByRole('button', { name: 'Restore now' }).click()
    await settingsNav.click()
    await page.getByRole('navigation', { name: /主视图|Main views/ }).first().getByRole('button', { name: 'Plan' }).click()
    const conflicts = page.locator('.conflicts')
    await expect(conflicts).toContainText('Time overlap')
    expect(await conflicts.innerText()).not.toMatch(CORE_ZH)

    // ICS warning
    await page.getByRole('navigation', { name: /主视图|Main views/ }).first().getByRole('button', { name: 'Inbox' }).click()
    await page.getByRole('button', { name: 'More ▾' }).click()
    await page.getByRole('menuitem', { name: 'Import .ics' }).click()
    await page.locator('.ics-import input[type="file"]').setInputFiles({
      name: 'bad.ics', mimeType: 'text/calendar', buffer: Buffer.from('not a calendar'),
    })
    await expect(page.locator('.ics-error')).toContainText('not an iCalendar')
    const icsText = await page.locator('.ics-import').innerText()
    expect((icsText.match(/not an iCalendar/g) ?? []).length, 'warning 只出现一次').toBe(1)
    await expect(page.locator('.ics-warnings li')).toHaveCount(0)
  })
})
