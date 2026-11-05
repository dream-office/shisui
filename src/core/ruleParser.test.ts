import { describe, it, expect } from 'vitest'
import { parseNotice, splitSegments } from './ruleParser'
import { SAMPLE_NOTICE, SAMPLE_WORK } from './samples'

const REF = new Date(2026, 10, 4, 22, 7, 0) // 2026-11-04 周三 22:07
const at = (m: number, d: number, h: number, min: number) => new Date(2026, m - 1, d, h, min).getTime()

describe('splitSegments 文本切分', () => {
  it('按换行、句号、编号切开', () => {
    expect(splitSegments('第一件事。\n2、第二件事；3. 第三件事')).toEqual(['第一件事', '2、第二件事', '3. 第三件事'])
  })

  it('丢掉过短的碎片', () => {
    expect(splitSegments('\n\n好的\n')).toEqual([])
  })
})

describe('parseNotice 真实通知解析', () => {
  const { tasks } = parseNotice(SAMPLE_NOTICE, REF)

  it('从一段四条消息里抽出四条待办，寒暄抬头被丢掉', () => {
    expect(tasks).toHaveLength(4)
    expect(tasks.every((t) => !t.title.includes('各位同学请注意'))).toBe(true)
  })

  it('实验报告：task + 学习通 + 周五 23:59', () => {
    const task = tasks[0]
    expect(task.kind).toBe('task')
    expect(task.channel).toBe('学习通')
    expect(task.dueAt).toBe(at(11, 6, 23, 59))
    expect(task.confidence).toBe('high')
  })

  it('班会：meeting + 地点 教学楼A301 + 下周 14:00', () => {
    const task = tasks[1]
    expect(task.kind).toBe('meeting')
    expect(task.location).toBe('教学楼A301')
    expect(task.startAt).toBe(at(11, 11, 14, 0))
  })

  it('答辩PPT：识别为评审类，并从邮箱地址看出提交渠道', () => {
    const task = tasks[2]
    expect(task.kind).toBe('review')
    expect(task.channel).toBe('邮箱')
    expect(task.dueAt).toBe(at(11, 18, 23, 59))
  })

  it('问卷：survey + 3天内', () => {
    const task = tasks[3]
    expect(task.kind).toBe('survey')
    expect(task.dueAt).toBe(at(11, 7, 23, 59))
  })

  it('每条都带可解释理由，且理由不为空', () => {
    for (const task of tasks) {
      expect(task.reasons.length).toBeGreaterThan(0)
      expect(task.rawText.length).toBeGreaterThan(0)
    }
  })

  it('同输入重复解析得到相同 id（可复现）', () => {
    const again = parseNotice(SAMPLE_NOTICE, REF).tasks
    expect(again.map((t) => t.id)).toEqual(tasks.map((t) => t.id))
  })

  it('时间短语会从标题里被裁掉', () => {
    for (const task of tasks) {
      expect(task.title).not.toMatch(/本周五23:59|下周三下午2点|11月18日/)
    }
  })
})

describe('parseNotice 边界', () => {
  it('完全没有待办的寒暄返回空列表并给出提示', () => {
    const result = parseNotice('大家早上好呀，今天天气不错', REF)
    expect(result.tasks).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('已取消的通知不再生成待办', () => {
    const result = parseNotice('原定周五的班会已取消，不再举行。', REF)
    expect(result.tasks).toHaveLength(0)
  })

  it('缺时间的模糊说法会被标记为低置信度', () => {
    const result = parseNotice('最近要交一份课程设计报告，具体时间待定', REF)
    expect(result.tasks[0].confidence).toBe('low')
  })
})

/**
 * 工作场景：和校园样本共用同一套规则。
 * 这组测试是「通用性」的守门人——以后如果只改了校园写法，
 * 这里会先红，而不是等用户贴一段项目群消息才发现解析不了。
 */
describe('parseNotice 工作群消息', () => {
  const { tasks } = parseNotice(SAMPLE_WORK, REF)

  it('工作群四条消息都能抽出来', () => {
    expect(tasks).toHaveLength(4)
  })

  it('预算表：task + 邮箱渠道 + 周五 18:00', () => {
    const task = tasks[0]
    expect(task.kind).toBe('task')
    expect(task.channel).toBe('邮箱')
    expect(task.dueAt).toBe(at(11, 6, 18, 0))
  })

  it('复盘会：meeting + 飞书渠道 + 3楼会议室 + 下周一 10:00', () => {
    const task = tasks[1]
    expect(task.kind).toBe('meeting')
    expect(task.channel).toBe('飞书')
    expect(task.location).toBe('3楼会议室')
    expect(task.startAt).toBe(at(11, 9, 10, 0))
  })

  it('报销单：payment + OA 渠道 + 11月20日 23:59', () => {
    const task = tasks[2]
    expect(task.kind).toBe('payment')
    expect(task.channel).toBe('OA/审批系统')
    expect(task.dueAt).toBe(at(11, 20, 23, 59))
  })

  it('问卷：survey + 飞书渠道 + 3天内', () => {
    const task = tasks[3]
    expect(task.kind).toBe('survey')
    expect(task.channel).toBe('飞书')
    expect(task.dueAt).toBe(at(11, 7, 23, 59))
  })
})
