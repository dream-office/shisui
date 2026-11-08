import { describe, expect, it } from 'vitest'
import { registerSignatureClick, SIGNATURE_WINDOW_MS } from './signature'

describe('registerSignatureClick', () => {
  it('点 1 次不触发', () => {
    expect(registerSignatureClick([], 1000)).toEqual({ open: false, clicks: [1000] })
  })

  it('点 2 次不触发', () => {
    const first = registerSignatureClick([], 1000)
    expect(registerSignatureClick(first.clicks, 1500)).toEqual({ open: false, clicks: [1000, 1500] })
  })

  it('2 秒内第 3 次触发，并清空计数', () => {
    const clicks = [1000, 1500]
    expect(registerSignatureClick(clicks, 2500)).toEqual({ open: true, clicks: [] })
  })

  it('超过 2 秒后点击重新计数，不触发', () => {
    const clicks = [1000, 1500]
    const result = registerSignatureClick(clicks, 1500 + SIGNATURE_WINDOW_MS + 1)
    expect(result.open).toBe(false)
    expect(result.clicks).toEqual([3501])
  })

  it('窗口内较早的点击会被淘汰', () => {
    const result = registerSignatureClick([1000, 3500], 3600)
    expect(result.open).toBe(false)
    expect(result.clicks).toEqual([3500, 3600])
  })
})
