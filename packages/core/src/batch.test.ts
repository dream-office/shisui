import { describe, expect, it } from 'vitest'
import { dedupeParsedTasks, parseNoticeBatch, splitNoticeSections } from './batch.js'
import type { ParsedTask } from './types.js'

const REF = new Date(2026, 10, 4, 10, 0, 0) // 周三

function task(title: string, dueAt: number | null, extra?: Partial<ParsedTask>): ParsedTask {
  return {
    id: `id-${title}-${dueAt}`,
    title,
    dueAt,
    startAt: null,
    kind: 'task',
    channel: null,
    location: null,
    rawText: title,
    confidence: 'high',
    reasons: [],
    engine: 'rule',
    ...extra,
  }
}

describe('splitNoticeSections', () => {
  it('空行切分', () => {
    const sections = splitNoticeSections('周五交报告\n\n下周三交材料')
    expect(sections.map((s) => s.raw)).toEqual(['周五交报告', '下周三交材料'])
  })

  it('--- 分隔线切分', () => {
    const sections = splitNoticeSections('周五交报告\n---\n下周三交材料')
    expect(sections).toHaveLength(2)
  })

  it('时间戳行切分，并保留该行后面的正文', () => {
    const raw = ['2026-11-04 10:23 张三：周五交报告', '2026-11-04 10:24 李四：下周三交材料'].join('\n')
    const sections = splitNoticeSections(raw)
    expect(sections).toHaveLength(2)
    expect(sections[0].raw).toContain('周五交报告')
    expect(sections[1].raw).toContain('下周三交材料')
  })

  it('连续空行不会切出空段', () => {
    const sections = splitNoticeSections('周五交报告\n\n\n\n下周三交材料')
    expect(sections).toHaveLength(2)
  })

  it('太短的段被丢弃', () => {
    const sections = splitNoticeSections('好的\n\n周五交实验报告')
    expect(sections.map((s) => s.raw)).toEqual(['周五交实验报告'])
  })
})

describe('dedupeParsedTasks', () => {
  it('标题空白归一化 + 同时间 → 视为重复', () => {
    const due = 1_800_000_000_000
    const result = dedupeParsedTasks([task('交 报告', due), task('交报告', due)])
    expect(result.kept).toHaveLength(1)
    expect(result.duplicates).toHaveLength(1)
  })

  it('标题同但时间不同 → 不合并', () => {
    const result = dedupeParsedTasks([task('交报告', 1), task('交报告', 2)])
    expect(result.kept).toHaveLength(2)
  })

  it('二选一分组不同 → 不合并（本周/下周双候选）', () => {
    const due = 1_800_000_000_000
    const result = dedupeParsedTasks([
      task('交周报', due, { choiceGroup: '本周日|2026-11-08', choiceLabel: '本周' }),
      task('交周报', due, { choiceGroup: '本周日|2026-11-08', choiceLabel: '下周' }),
    ])
    expect(result.kept).toHaveLength(2)
    expect(result.duplicates).toHaveLength(0)
  })
})

describe('parseNoticeBatch', () => {
  it('多段分别解析并合并结果', () => {
    const raw = ['本周五23:59前交实验报告', '下周三下午2点3楼会议室开会'].join('\n\n')
    const result = parseNoticeBatch(raw, REF)

    expect(result.sections).toBe(2)
    expect(result.tasks.length).toBeGreaterThanOrEqual(2)
    expect(result.tasks.every((t) => t.rawText.length > 0)).toBe(true)
  })

  it('重复段只保留一条，并记录重复数', () => {
    const raw = '本周五23:59前交实验报告\n\n本周五23:59前交实验报告'
    const result = parseNoticeBatch(raw, REF)
    expect(result.tasks).toHaveLength(1)
    expect(result.duplicates.length).toBeGreaterThanOrEqual(1)
  })

  it('空输入给出提示', () => {
    const result = parseNoticeBatch('   ', REF)
    expect(result.sections).toBe(0)
    expect(result.tasks).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('500 段在合理时间内完成', () => {
    const block = '本周五23:59前交实验报告'
    const raw = Array.from({ length: 500 }, () => block).join('\n\n')
    const start = Date.now()
    const result = parseNoticeBatch(raw, REF)
    const ms = Date.now() - start

    expect(result.sections).toBe(500)
    expect(result.tasks).toHaveLength(1) // 全部重复
    expect(result.duplicates).toHaveLength(499)
    expect(ms).toBeLessThan(2000)
  })
})

describe('切分优先级（时间戳 > --- > 空行）', () => {
  it('有时间戳行时，空行和 --- 都不切', () => {
    const raw = [
      '2026-11-04 10:23 张三：周五交报告',
      '',
      '---',
      '',
      '2026-11-04 10:24 李四：下周三交材料',
    ].join('\n')
    const sections = splitNoticeSections(raw)
    expect(sections).toHaveLength(2)
    expect(sections[0].raw).toContain('周五交报告')
    expect(sections[0].raw).toContain('---') // 正文里的 --- 保留，不当作分隔
    expect(sections[1].raw).toContain('下周三交材料')
  })

  it('没有时间戳但有 --- 时，只按 --- 切，空行不切', () => {
    const raw = ['周五交报告', '', '下周三交材料', '---', '下周五交总结'].join('\n')
    const sections = splitNoticeSections(raw)
    expect(sections).toHaveLength(2)
    expect(sections[0].raw).toContain('周五交报告')
    expect(sections[0].raw).toContain('下周三交材料')
    expect(sections[1].raw).toContain('下周五交总结')
  })

  it('只有空行切分', () => {
    const sections = splitNoticeSections('周五交报告\n\n下周三交材料')
    expect(sections).toHaveLength(2)
  })

  it('[HH:mm] 方括号时间戳也切分', () => {
    const raw = ['[10:23] 周五交报告', '[10:24] 下周三交材料'].join('\n')
    const sections = splitNoticeSections(raw)
    expect(sections).toHaveLength(2)
  })
})
describe('段首时间戳参与该段解析', () => {
  it('时间戳行后面的正文会被解析成待办', () => {
    const raw = ['2026-11-04 10:23 张三：本周五23:59前交实验报告', '2026-11-04 10:24 李四：下周三下午2点开会'].join('\n')
    const result = parseNoticeBatch(raw, REF)
    expect(result.sections).toBe(2)
    expect(result.tasks.length).toBeGreaterThanOrEqual(2)
    expect(result.tasks.some((task) => task.title.includes('实验报告'))).toBe(true)
  })
})