
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'

const FIX = join(process.cwd(), 'e2e', 'fixtures')
const docInput = (page: Page) => page.locator('.import-panel input[type="file"]').first()
const imageInput = (page: Page) => page.locator('.import-panel input[type="file"]').nth(1)

test.describe('v1.3 文档导入', () => {
  test('D1. TXT / MD / PDF / DOCX 文本填入收件框', async ({ page }) => {
    await page.goto('/')
    const textarea = page.locator('textarea')

    await docInput(page).setInputFiles(join(FIX, 'notice.txt'))
    await expect(textarea).toHaveValue(/实验报告三/)
    await expect(page.locator('.import-ok')).toContainText('文档已导入')

    await page.getByRole('button', { name: '清空' }).click()
    await docInput(page).setInputFiles(join(FIX, 'notice.md'))
    await expect(textarea).toHaveValue(/教学楼A301/)

    await page.getByRole('button', { name: '清空' }).click()
    await docInput(page).setInputFiles(join(FIX, 'notice.pdf'))
    await expect(textarea).toHaveValue(/Submit lab report/)

    await page.getByRole('button', { name: '清空' }).click()
    await docInput(page).setInputFiles(join(FIX, 'notice.docx'))
    await expect(textarea).toHaveValue(/实验报告三/)
  })

  test('D2. 扫描版 PDF 给可读提示；21MB 文档拒绝', async ({ page }) => {
    await page.goto('/')
    await docInput(page).setInputFiles(join(FIX, 'scanned.pdf'))
    await expect(page.locator('.import-error')).toContainText('扫描版 PDF')

    await docInput(page).setInputFiles({
      name: 'huge.txt',
      mimeType: 'text/plain',
      buffer: Buffer.alloc(21 * 1024 * 1024, 97),
    })
    await expect(page.locator('.import-error')).toContainText('文件太大')
  })
})

test.describe('v1.3 图片识别', () => {
  test('I1. 本地 OCR：先声明；确认前不加载语言包；0 外网请求', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await page.addInitScript(() => {
      ;(window as any).__DSH_TEST_OCR__ = { text: '请于11月10日23:59前提交实验报告' }
    })
    await page.goto('/')
    await imageInput(page).setInputFiles(join(FIX, 'photo.png'))
    await expect(page.getByRole('dialog', { name: '选择图片识别方式' })).toBeVisible()
    await page.getByRole('button', { name: '本地 OCR（离线）' }).click()
    const dialog = page.getByRole('dialog', { name: '本地识别说明' })
    await expect(dialog).toBeVisible()
    const contrast = await dialog.locator('.import-notice-list li').first().evaluate((el) => {
      const parse = (value: string) => value.match(/\d+/g)!.map(Number)
      const luminance = ([r, g, b]: number[]) => {
        const channel = (v: number) => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }
      const fg = luminance(parse(getComputedStyle(el).color))
      const bg = luminance(parse(getComputedStyle(el.closest('.import-modal')!).backgroundColor))
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
    expect(requests.filter((url) => url.includes('/tessdata/'))).toHaveLength(0)

    await page.getByRole('button', { name: '同意并开始识别' }).click()
    await expect(page.locator('textarea')).toHaveValue(/实验报告/)
    expect(requests.filter((url) => url.includes('/tessdata/'))).toHaveLength(0)
    const external = requests.filter((url) => !url.startsWith('http://127.0.0.1:5199'))
    expect(external).toEqual([])
  })

  test('I2. 关闭图片识别时按钮禁用；无 API 时 AI 选项禁用', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => window.localStorage.setItem('shisui.imageMode', 'off'))
    await page.reload()
    const imageButton = page.getByRole('button', { name: '识别图片' })
    await expect(imageButton).toBeDisabled()
    await expect(imageButton).toHaveAttribute('title', '图片识别已关闭')

    await page.evaluate(() => window.localStorage.removeItem('shisui.imageMode'))
    await page.reload()
    await imageInput(page).setInputFiles(join(FIX, 'photo.png'))
    const dialog = page.getByRole('dialog', { name: '选择图片识别方式' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'AI 识图（发送到 API）' })).toBeDisabled()
  })

  test('I3. AI 识图：未确认 0 请求；确认后 mock 视觉响应 → 候选', async ({ page }) => {
    let calls = 0
    let body = ''
    await page.route('**/chat/completions', async (route) => {
      calls += 1
      body = route.request().postData() ?? ''
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  tasks: [
                    {
                      title: '提交实验报告',
                      kind: 'task',
                      dueAt: '2026-11-10T23:59:00+08:00',
                      url: 'https://example.com/lab',
                      note: '从图片识别',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      })
    })
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'shisui.llm.config',
        JSON.stringify({ endpoint: 'https://api.example.com/v1/chat/completions', apiKey: 'sk-test', model: 'vision-model' }),
      )
    })
    await page.goto('/')
    await imageInput(page).setInputFiles(join(FIX, 'photo.png'))
    await page.getByRole('button', { name: 'AI 识图（发送到 API）' }).click()
    await expect(page.getByRole('dialog', { name: '确认发送图片' })).toBeVisible()
    expect(calls).toBe(0)

    await page.getByRole('checkbox', { name: '我确认发送这张图片' }).check()
    await page.getByRole('button', { name: '发送并识别' }).click()
    await expect(page.locator('.candidate')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('.candidate-title')).toHaveValue('提交实验报告')
    expect(calls).toBe(1)
    expect(body).toContain('data:image/jpeg;base64,')
  })

  test('I4. 图片识别模式持久化；无 API 时设置页 AI 选项禁用', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    await page.getByRole('radio', { name: /^本地 OCR（离线）/ }).check()
    await page.reload()
    await page.getByRole('navigation', { name: '主视图' }).getByRole('button', { name: /^设置/ }).click()
    await expect(page.getByRole('radio', { name: /^本地 OCR（离线）/ })).toBeChecked()
    await expect(page.getByRole('radio', { name: /^AI 识图/ })).toBeDisabled()
  })
})


test.describe('v1.3 更多边界', () => {
  test('I5. 低内存设备提示建议 AI（不强制）', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => 2 })
    })
    await page.goto('/')
    await imageInput(page).setInputFiles(join(FIX, 'photo.png'))
    await page.getByRole('button', { name: '本地 OCR（离线）' }).click()
    await expect(page.getByText('设备内存较低，建议改用 AI 识图（不强制）。')).toBeVisible()
    await expect(page.getByRole('button', { name: '同意并开始识别' })).toBeEnabled()
  })

  test('I6. OCR 失败给可读提示，不静默降级到 AI', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await page.addInitScript(() => {
      ;(window as any).__DSH_TEST_OCR__ = { error: 'mock failure' }
    })
    await page.goto('/')
    await imageInput(page).setInputFiles(join(FIX, 'photo.png'))
    await page.getByRole('button', { name: '本地 OCR（离线）' }).click()
    await page.getByRole('button', { name: '同意并开始识别' }).click()
    await expect(page.locator('.import-error')).toContainText('本地识别失败')
    expect(requests.some((url) => url.includes('chat/completions'))).toBe(false)
  })
})
