
import { afterEach, describe, expect, it } from 'vitest'
import { setLang, tCore } from './index'

afterEach(() => setLang('zh'))

describe('v1.4 tCore', () => {
  it('中文/英文渲染与参数插值', () => {
    setLang('zh')
    expect(tCore({ code: 'reason.kindHit', params: { label: 'kind.exam' } })).toBe('命中「考试/测验」关键词')
    setLang('en')
    expect(tCore({ code: 'reason.kindHit', params: { label: 'kind.exam' } })).toBe('Matched “exam” keyword')
    expect(tCore({ code: 'conflict.pileup.title', params: { count: 3 } })).toContain('3')
  })

  it('缺 key 回退旧中文，无消息回退空/自定义', () => {
    setLang('en')
    expect(tCore({ code: 'unknown.code' }, '旧中文')).toBe('旧中文')
    expect(tCore(undefined, '旧中文')).toBe('旧中文')
    expect(tCore(undefined)).toBe('')
  })
})
