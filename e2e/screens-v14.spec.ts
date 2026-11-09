
import { test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.tmp', 'v14-i18n')

test.describe('v1.4 English 动态文本截图', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

  const toEnglish = async (page: import('@playwright/test').Page) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('button', { name: 'English' }).click()
  }

  test('解析 reasons', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await toEnglish(page)
    await page.locator('nav').getByRole('button', { name: 'Inbox' }).click()
    await page.getByRole('button', { name: 'More ▾' }).click()
    await page.getByRole('menuitem', { name: 'Work example' }).click()
    await page.getByRole('button', { name: 'Parse', exact: true }).click()
    await page.getByRole('heading', { name: /Found \d+ to-dos/ }).waitFor({ timeout: 15_000 })
    await page.locator('details.reasons').first().locator('summary').click()
    await page.locator('.candidate').first().screenshot({ path: join(OUT, 'english-reasons.png') })
  })

  test('冲突提示', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await toEnglish(page)
    const base = Date.now() + 2 * 60 * 60_000
    const task = (id: string, title: string) => ({ id, title, dueAt: base, startAt: base, endAt: base + 60 * 60_000, createdAt: Date.now(), allDay: false, rrule: null, seriesId: null, recurrenceIndex: 0, skipped: false, tags: [], kind: 'task', channel: null, location: null, url: null, note: null, rawText: '', confidence: 'high', reasons: ['imported'], engine: 'import', done: false, editedFields: [], sourceUid: null })
    const backup = { format: 'shisui-backup', backupVersion: 1, schemaVersion: 4, exportedAt: new Date().toISOString(), appVersion: '1.4.0', tasks: [task('a', 'Alpha'), task('b', 'Beta')], series: [], batches: [], settings: {} }
    await page.locator('input[type="file"][accept*="json"]').setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await page.getByRole('button', { name: 'Restore now' }).click()
    await page.locator('nav').getByRole('button', { name: 'Plan' }).click()
    await page.locator('.conflicts').screenshot({ path: join(OUT, 'english-conflict.png') })
  })

  test('ICS warning', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await toEnglish(page)
    await page.locator('nav').getByRole('button', { name: 'Inbox' }).click()
    await page.getByRole('button', { name: 'More ▾' }).click()
    await page.getByRole('menuitem', { name: 'Import .ics' }).click()
    await page.locator('.ics-import input[type="file"]').setInputFiles({ name: 'bad.ics', mimeType: 'text/calendar', buffer: Buffer.from('not a calendar') })
    await page.locator('.ics-import').screenshot({ path: join(OUT, 'english-ics-warning.png') })
  })
})
