
import { describe, expect, it } from 'vitest'
import { extensionOf, truncateText, validateDocument, validateImage, TEXT_MAX_CHARS } from './fileLimits'

describe('v1.3 导入限制', () => {
  it('扩展名与旧 Office 拒绝', () => {
    expect(validateDocument({ name: 'a.docx', size: 1 })).toBeNull()
    expect(validateDocument({ name: 'a.doc', size: 1 })).toBe('legacy-office')
    expect(validateDocument({ name: 'a.xlsx', size: 1 })).toBe('unsupported-type')
    expect(validateImage({ name: 'a.png', size: 1 })).toBeNull()
    expect(validateImage({ name: 'a.gif', size: 1 })).toBe('unsupported-type')
  })

  it('文档 20MB / 图片 10MB 上限', () => {
    expect(validateDocument({ name: 'a.pdf', size: 20 * 1024 * 1024 })).toBeNull()
    expect(validateDocument({ name: 'a.pdf', size: 20 * 1024 * 1024 + 1 })).toBe('too-large')
    expect(validateImage({ name: 'a.jpg', size: 10 * 1024 * 1024 })).toBeNull()
    expect(validateImage({ name: 'a.jpg', size: 10 * 1024 * 1024 + 1 })).toBe('too-large')
  })

  it('文本超过 5 万字截断并提示', () => {
    const { text, truncated } = truncateText('字'.repeat(TEXT_MAX_CHARS + 10))
    expect(truncated).toBe(true)
    expect(text).toContain('已截断')
    expect(truncateText('短文本').truncated).toBe(false)
  })

  it('扩展名大小写不敏感', () => {
    expect(extensionOf('A.PDF')).toBe('pdf')
    expect(validateDocument({ name: 'A.PDF', size: 1 })).toBeNull()
  })
})
