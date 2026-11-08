
import { describe, expect, it } from 'vitest'
import { hasEnglish } from '@/i18n'
import { CONF_LABEL, KIND_LABEL } from './candidateLabels'

describe('candidateLabels i18n', () => {
  it('KIND_LABEL 每个值都有英文翻译', () => {
    for (const key of Object.keys(KIND_LABEL) as Array<keyof typeof KIND_LABEL>) {
      expect(hasEnglish(KIND_LABEL[key]), KIND_LABEL[key]).toBe(true)
    }
  })

  it('CONF_LABEL 每个值都有英文翻译', () => {
    for (const key of Object.keys(CONF_LABEL) as Array<keyof typeof CONF_LABEL>) {
      expect(hasEnglish(CONF_LABEL[key]), CONF_LABEL[key]).toBe(true)
    }
  })
})
