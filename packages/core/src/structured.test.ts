
import { describe, expect, it } from 'vitest'
import { parseNotice } from './ruleParser.js'
import { buildBackup, validateBackup } from './backup.js'

const REF = new Date(2026, 10, 4, 16, 0, 0) // 2026-11-04 周四
const at = (m: number, d: number, h: number, min: number) => new Date(2026, m - 1, d, h, min).getTime()

const COMPETITION = `关于组织参加大学生竞赛的通知
各学院：
一、WPS 智能办公能力挑战赛（校赛）
报名/考试链接：https://f.kdocs.cn/g/BcUkkscR/
考试时间：2026年11月5日9:00-11月8日22:00
二、AI 创新应用挑战赛（校赛）
链接：https://f.kdocs.cn/g/rPtGIP9T/
考试时间：2026年11月5日9:00-11月8日22:00
三、程序设计（校赛）
考试时间：2026年11月5日14:30-2026年11月5日16:00
链接 11 月 4 日 16:00 后更新
温馨提示：进入链接需填写官网报名信息（UID、姓名、手机号等），信息必须与官网保持一致；未在官网报名的学生，请在赛前完成账号注册，获取 UID。
免费参与，获奖率高，简历添彩，评综测加分，祝取得好成绩！`

const TIP = '进入链接需填写官网报名信息（UID、姓名、手机号等），信息必须与官网保持一致；未在官网报名的学生，请在赛前完成账号注册，获取 UID。'

describe('v1.2 结构化多事项', () => {
  const { tasks } = parseNotice(COMPETITION, REF)

  it('三个赛道 → 3 条，标题/起止/URL 正确', () => {
    expect(tasks).toHaveLength(3)
    expect(tasks.map((t) => t.title)).toEqual([
      'WPS 智能办公能力挑战赛（校赛）',
      'AI 创新应用挑战赛（校赛）',
      '程序设计（校赛）',
    ])
    expect(tasks[0].startAt).toBe(at(11, 5, 9, 0))
    expect(tasks[0].dueAt).toBe(at(11, 8, 22, 0))
    expect(tasks[1].url).toBe('https://f.kdocs.cn/g/rPtGIP9T/')
    expect(tasks[2].startAt).toBe(at(11, 5, 14, 30))
    expect(tasks[2].dueAt).toBe(at(11, 5, 16, 0))
    expect(tasks[2].url).toBeNull()
  })

  it('每条带温馨提示；第三条带「链接后更新」；营销句丢弃', () => {
    expect(tasks.every((t) => t.note?.includes(TIP))).toBe(true)
    expect(tasks[2].note).toContain('链接 11 月 4 日 16:00 后更新')
    expect(tasks.every((t) => !t.note?.includes('获奖率高') && !t.note?.includes('评综测'))).toBe(true)
  })

  it('kind=exam，channel/location 为空，URL 不进 channel', () => {
    expect(tasks.every((t) => t.kind === 'exam' && t.channel === null && t.location === null)).toBe(true)
  })

  it('备份能带上 url/note（旧备份缺省 null）', () => {
    const stored = { ...tasks[0], createdAt: Date.now(), done: false, editedFields: [] }
    const backup = buildBackup({ tasks: [stored], series: [], batches: [], settings: {} })
    const restored = validateBackup(JSON.parse(JSON.stringify(backup)))
    expect(restored.ok).toBe(true)
    expect(restored.backup?.tasks[0].url).toBe(tasks[0].url)
    expect(restored.backup?.tasks[0].note).toBe(tasks[0].note)

    const old = JSON.parse(JSON.stringify(backup)) as Record<string, unknown>
    delete (old.tasks as Array<Record<string, unknown>>)[0].url
    delete (old.tasks as Array<Record<string, unknown>>)[0].note
    const oldRestored = validateBackup(old)
    expect(oldRestored.ok).toBe(true)
    expect(oldRestored.backup?.tasks[0].url).toBeNull()
    expect(oldRestored.backup?.tasks[0].note).toBeNull()
  })
})
