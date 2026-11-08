import { describe, expect, it } from 'vitest'
import { filterTasks, matchTask, normalizeTags, parseQuery, toggleTag } from './search.js'

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 't1',
  title: '交报告',
  rawText: '周五前交实验报告',
  location: '3 楼',
  channel: '邮箱',
  tags: ['作业'],
  ...overrides,
})

describe('parseQuery', () => {
  it('#tag 与普通词分开', () => {
    expect(parseQuery('#作业 报告')).toEqual({ terms: ['报告'], tags: ['作业'], raw: '#作业 报告' })
  })

  it('空输入', () => {
    expect(parseQuery('   ')).toEqual({ terms: [], tags: [], raw: '' })
  })
})

describe('matchTask', () => {
  it('标题包含匹配', () => {
    expect(matchTask(task(), parseQuery('报告'))).toBe(true)
    expect(matchTask(task(), parseQuery('会议'))).toBe(false)
  })

  it('原文/地点/渠道也参与匹配', () => {
    expect(matchTask(task(), parseQuery('实验'))).toBe(true) // rawText
    expect(matchTask(task(), parseQuery('3 楼'))).toBe(true) // location
    expect(matchTask(task(), parseQuery('邮箱'))).toBe(true) // channel
  })

  it('#tag 精确匹配标签（大小写不敏感）', () => {
    expect(matchTask(task(), parseQuery('#作业'))).toBe(true)
    expect(matchTask(task({ tags: ['HomeWork'] }), parseQuery('#homework'))).toBe(true)
    expect(matchTask(task(), parseQuery('#工作'))).toBe(false)
  })

  it('多个词是与关系', () => {
    expect(matchTask(task(), parseQuery('#作业 报告'))).toBe(true)
    expect(matchTask(task(), parseQuery('#作业 会议'))).toBe(false)
  })

  it('空查询匹配全部', () => {
    expect(matchTask(task(), parseQuery(''))).toBe(true)
  })
})

describe('filterTasks', () => {
  it('过滤并保留顺序', () => {
    const tasks = [task({ id: 'a', title: '交报告' }), task({ id: 'b', title: '开会' })]
    expect(filterTasks(tasks, '开会').map((item) => item.id)).toEqual(['b'])
    expect(filterTasks(tasks, '').map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('normalizeTags / toggleTag', () => {
  it('去空白、去 #、去重（大小写不敏感）、限长', () => {
    expect(normalizeTags([' 作业 ', '#作业', 'HOME', 'home', '', 'x'.repeat(30)])).toEqual(['作业', 'HOME', 'xxxxxxxxxxxxxxxxxxxx'])
  })

  it('增删标签返回新数组', () => {
    const tags = ['作业']
    expect(toggleTag(tags, '复习', true)).toEqual(['作业', '复习'])
    expect(toggleTag(tags, '作业', false)).toEqual([])
    expect(tags).toEqual(['作业']) // 不改入参
  })
})
