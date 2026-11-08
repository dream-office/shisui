import { describe, expect, it } from 'vitest'
import { appendClipboardText } from './paste.js'

describe('appendClipboardText', () => {
  it('空输入 → 直接用剪贴板内容', () => {
    expect(appendClipboardText('', '周一9点开会')).toBe('周一9点开会')
    expect(appendClipboardText('   \n', '周一9点开会')).toBe('周一9点开会')
  })

  it('已有内容 → 单换行追加', () => {
    expect(appendClipboardText('已有内容', '周一9点开会')).toBe('已有内容\n周一9点开会')
  })

  it('末尾已有换行 → 不重复补换行', () => {
    expect(appendClipboardText('已有内容\n', '周一9点开会')).toBe('已有内容\n周一9点开会')
    expect(appendClipboardText('已有内容\n\n', '周一9点开会')).toBe('已有内容\n周一9点开会')
  })

  it('多次追加不累积空行', () => {
    let text = '第一段'
    text = appendClipboardText(text, '第二段')
    text = appendClipboardText(text, '第三段')
    expect(text).toBe('第一段\n第二段\n第三段')
  })
})
