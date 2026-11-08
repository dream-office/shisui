import { describe, it, expect } from 'vitest'
import { parseNotice, parseSegment, parseSegmentCandidates, splitSegments } from './ruleParser.js'
import { SAMPLE_NOTICE, SAMPLE_NOTICE_2, SAMPLE_WORK } from './samples.js'

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

/**
 * 标题裁剪：只删时间短语本身（含时段词与紧邻虚词），不删前后正文。
 * 断言必须是【完整标题】——只写 not.toMatch 抓不到「于确认」「上午在…」这类残句。
 */
describe('标题裁剪', () => {
  const cases: Array<[string, string]> = [
    ['请于本周五18:00前把预算表发到财务邮箱。', '把预算表发到财务邮箱'],
    ['截止日期为11月20日，请尽快提交报销单。', '尽快提交报销单'],
    ['本周五 23:59 之前交实验报告。', '交实验报告'],
    ['请在 11月20日 前提交到 OA。', '提交到 OA'],
    ['如果本周五18:00前不提交，视为放弃。', '不提交，视为放弃'],
    // 时段词必须跟着钟点一起删掉
    ['请于下午3点前提交报销单。', '提交报销单'],
    ['11月18日下午3点开会，请准时。', '开会，请准时'],
    // 「关于」不能被裸「于」削成「关」
    ['关于11月18日提交报销单的通知。', '提交报销单的通知'],
    // 显式介词短语
    ['截至11月20日，请提交报销单。', '提交报销单'],
    ['截止到11月20日18:00前提交报销单。', '提交报销单'],
    ['会议定于11月18日下午3点举行', '会议举行'],
    // 日期后的星期注记
    ['11月18日（周三）前提交报销单。', '提交报销单'],
    // 「前台」「前往」里的「前」不是截止词
    ['11月18日前台集合', '前台集合'],
    ['11月18日前往北京出差', '前往北京出差'],
    // 时段词与钟点之间夹了字：两边各自删，不能连带吃掉中间正文
    ['上午会议9点开始，请准时。', '会议开始，请准时'],
    ['11月18日下午会议3点开始，请准时。', '会议开始，请准时'],
    ['会议时间定在11月18日下午3点。', '会议时间'],
    // 裸「在」兜底：避免「会议在举行」这种残句
    ['会议在11月18日举行。', '会议举行'],
  ]

  it.each(cases)('%s → %s', (raw, expected) => {
    const { tasks } = parseNotice(raw, REF)
    expect(tasks[0].title).toBe(expected)
  })

  it('日期与钟点隔得远时，中间正文不能被删（断言完整标题）', () => {
    const { tasks } = parseNotice('请于11月18日之前把预算表发到财务邮箱，并在下午3点前确认。', REF)
    expect(tasks[0].title).toBe('把预算表发到财务邮箱，确认')
  })
})

/**
 * 样本标题整体回归：这些标题是用户点「工作群示例 / 学校通知示例」第一眼看到的东西。
 * 之前只断言 kind/channel/dueAt，标题被裁成「上午在 3楼会议室…」也全绿。
 */
describe('示例样本的标题', () => {
  const PERIOD_WORDS = /上午|下午|中午|晚上|凌晨|傍晚/

  it('工作群样本：标题不含残留时段词', () => {
    const { tasks } = parseNotice(SAMPLE_WORK, REF)
    for (const task of tasks) expect(task.title).not.toMatch(PERIOD_WORDS)
    expect(tasks[1].title).toBe('3楼会议室开项目复盘会，飞书会议同步，请提前准备')
    expect(tasks[2].title).toBe('报销单提交到 OA，逾期本季度不再受理')
  })

  it('学校通知样本：标题不含残留时段词', () => {
    const { tasks } = parseNotice(SAMPLE_NOTICE, REF)
    for (const task of tasks) expect(task.title).not.toMatch(PERIOD_WORDS)
    expect(tasks[1].title).toContain('召开选题班会')
  })

  it('辅导员样本：标题不含残留时段词', () => {
    const { tasks } = parseNotice(SAMPLE_NOTICE_2, REF)
    for (const task of tasks) expect(task.title).not.toMatch(PERIOD_WORDS)
    expect(tasks[0].title).toBe('把国家助学贷款回执交到学生办公室302')
    expect(tasks[1].title).toBe('图书馆报告厅有考研经验分享会，想去的同学报名')
  })
})

describe('取消类通知', () => {
  it('裸「取消」的班会不生成待办', () => {
    expect(parseNotice('本周五的班会取消，请大家互相转告。', REF).tasks).toHaveLength(0)
  })

  it('「已截止」的报名不生成待办', () => {
    expect(parseNotice('报名已截止，请关注下次通知。', REF).tasks).toHaveLength(0)
  })

  it('「逾期不再受理」是催交，不是取消', () => {
    const { tasks } = parseNotice('报销单请在11月20日前提交到 OA，逾期本季度不再受理。', REF)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].kind).toBe('payment')
  })
})

/** 默认时刻：事件类 09:00，截止类 23:59 —— README 里承诺的行为，必须有测试兜着 */
describe('没有钟点时的默认时刻', () => {
  it('会议默认 09:00，并作为开始时刻', () => {
    const { tasks } = parseNotice('下周一开会', REF)
    expect(tasks[0].kind).toBe('meeting')
    expect(tasks[0].dueAt).toBe(at(11, 9, 9, 0))
    expect(tasks[0].startAt).toBe(at(11, 9, 9, 0))
  })

  it('考试默认 09:00', () => {
    const { tasks } = parseNotice('下周一考试', REF)
    expect(tasks[0].kind).toBe('exam')
    expect(tasks[0].dueAt).toBe(at(11, 9, 9, 0))
  })

  it('截止类默认 23:59，且不设开始时刻', () => {
    const { tasks } = parseNotice('11月18日前提交报销单', REF)
    expect(tasks[0].dueAt).toBe(at(11, 18, 23, 59))
    expect(tasks[0].startAt).toBeNull()
  })
})

describe('办公类类型与渠道', () => {
  it('审批：approval + OA 渠道', () => {
    const { tasks } = parseNotice('请在本周五前完成报销单审批，走 OA 流程。', REF)
    expect(tasks[0].kind).toBe('approval')
    expect(tasks[0].channel).toBe('OA/审批系统')
  })

  it.each([
    ['下周一10点钉钉群开周会', '钉钉'],
    ['下周一10点企业微信开周会', '企业微信'],
    ['本周五18:00前把文档传到腾讯文档', '在线文档'],
    ['明天下午3点Zoom会议', '线上会议'],
  ])('%s → 渠道 %s', (raw, channel) => {
    expect(parseNotice(raw, REF).tasks[0].channel).toBe(channel)
  })
})

/**
 * 辅导员提醒样本：同时验证「图书馆报告厅」整体地点与「会议号不是房间号」。
 * 这份样本以前只有定义没人用（死代码），现在接进测试。
 */
describe('parseNotice 辅导员提醒', () => {
  const { tasks } = parseNotice(SAMPLE_NOTICE_2, REF)

  it('三条都能抽出来', () => {
    expect(tasks).toHaveLength(3)
  })

  it('「图书馆报告厅」作为整体地点，不被截成「图书馆」', () => {
    const task = tasks.find((t) => t.title.includes('分享会'))!
    expect(task.location).toBe('图书馆报告厅')
  })

  it('会议号 123-456-789 不会被误认成房间号', () => {
    const task = tasks.find((t) => t.title.includes('班会'))!
    expect(task.location).toBeNull()
  })
})

describe('v0.7.0 规则引擎：新时间表达与双候选', () => {
  const SUN = new Date(2026, 10, 8, 10, 0, 0) // 周日
  const REF2 = new Date(2026, 10, 4, 10, 0, 0) // 周三

  it('周日当天「本周日」产出两个候选（本周 / 下周）', () => {
    const tasks = parseSegmentCandidates('本周日交周报', SUN, 0)

    expect(tasks).toHaveLength(2)
    expect(tasks[0].id).toMatch(/@this-week$/)
    expect(tasks[1].id).toMatch(/@next-week$/)
    expect(tasks[0].choiceGroup).toBe(tasks[1].choiceGroup)
    expect(tasks[0].choiceGroup).toContain('本周日|2026-11-08')
    expect(tasks[0].choiceLabel).toBe('本周（今天）')
    expect(tasks[1].choiceLabel).toBe('下周（7 天后）')
    expect(tasks[0].confidence).toBe('low')
    expect(tasks[0].reasons.join(' ')).toContain('周日当天，本周=今天 23:59；下周=7 天后')

    // 默认本周 = 今天 23:59；下周 = 7 天后 23:59
    expect(tasks[0].dueAt).toBe(new Date(2026, 10, 8, 23, 59, 0, 0).getTime())
    expect(tasks[1].dueAt).toBe(new Date(2026, 10, 15, 23, 59, 0, 0).getTime())
  })

  it('非周日不产生双候选', () => {
    const tasks = parseSegmentCandidates('本周日交周报', REF2, 0)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].choiceGroup).toBeUndefined()
  })

  it('parseNotice 在周日当天返回两条候选', () => {
    const result = parseNotice('本周日交周报', SUN)
    expect(result.tasks).toHaveLength(2)
  })

  it('月底前 → 本月最后一天 23:59，低置信度且有假设说明', () => {
    const task = parseSegment('月底前把报销单交了', REF2, 0)!
    expect(task.dueAt).toBe(new Date(2026, 10, 30, 23, 59, 0, 0).getTime())
    expect(task.confidence).toBe('low')
    expect(task.reasons.join(' ')).toContain('月底')
  })

  it('工作日 → 18:00，reasons 写明「今天 18:00」的假设', () => {
    const monday = new Date(2026, 10, 9, 9, 0, 0)
    const task = parseSegment('工作日把材料交了', monday, 0)!
    expect(task.dueAt).toBe(new Date(2026, 10, 9, 18, 0, 0, 0).getTime())
    expect(task.reasons.join(' ')).toContain('今天 18:00')
  })

  it('学期末 → 最近的 1/15 或 7/15', () => {
    const task = parseSegment('本学期末交实习报告', REF2, 0)!
    expect(task.dueAt).toBe(new Date(2027, 0, 15, 23, 59, 0, 0).getTime())
    expect(task.reasons.join(' ')).toContain('2027-01-15')
  })
})

/**
 * v1.1.3 抽取质量：用两条匿名样本做回归（不写姓名/真实单位），
 * 并覆盖章节/平台/时间安排/角色分工/URL/起止日/去重等边界。
 */
describe('v1.1.3 抽取质量样本', () => {
  const SAMPLE_A = `教材征订补充通知
各班：
一、请转告本班订购该教材的同学自查缺页，并留存影像。
二、请统计缺页数量并于11月10日23:59前反馈（留存影像）。
三、学习（考试）平台：https://example.edu.cn/textbook
四、时间安排：11月5日9:00起至12月30日23:59
五、学习委员负责汇总并提醒。`

  const SAMPLE_B = `军事理论课学习通知
一、学习（考试）平台：https://mooc.example.com/military
二、学习时间：11月5日09:00起至12月30日23:59
三、请同学们于12月30日23:59前完成军事理论课课程学习。
四、请同学们于12月30日23:59前完成军事理论课考试。
五、学习委员负责统计学习进度并提醒。`

  it('样本 A：订书通知按行动拆成 2 条，截止相同、无地点渠道', () => {
    const { tasks } = parseNotice(SAMPLE_A, REF)
    expect(tasks).toHaveLength(2)
    const titles = tasks.map((task) => task.title)
    expect(titles.some((title) => title.includes('转告') && title.includes('自查缺页'))).toBe(true)
    expect(titles.some((title) => title.includes('统计缺页数量') && title.includes('反馈'))).toBe(true)
    expect(tasks.every((task) => task.dueAt === at(11, 10, 23, 59))).toBe(true)
    expect(tasks.every((task) => task.location === null && task.channel === null)).toBe(true)
  })

  it('样本 B：课程学习与考试拆成 2 条，due 12/30 23:59，URL 不进 channel', () => {
    const { tasks } = parseNotice(SAMPLE_B, REF)
    expect(tasks).toHaveLength(2)
    const titles = tasks.map((task) => task.title)
    expect(titles.some((title) => title.includes('课程学习'))).toBe(true)
    expect(titles.some((title) => title === '完成军事理论课考试')).toBe(true)
    expect(tasks.every((task) => task.dueAt === at(12, 30, 23, 59))).toBe(true)
    expect(tasks.every((task) => task.channel === null && task.location === null && task.startAt === null)).toBe(true)
  })

  it('章节标题、纯平台/网址/时间安排、角色分工不产任务', () => {
    const raw = `通知
一、学习要求
二、平台：https://example.com/a
三、网址：https://example.com/b
四、时间安排：11月5日至12月30日
五、学习委员负责跟进并提醒。`
    expect(parseNotice(raw, REF).tasks).toHaveLength(0)
  })

  it('没有行动要求的「截止时间」只是信息', () => {
    expect(parseNotice('截止时间：11月10日23:59', REF).tasks).toHaveLength(0)
  })

  it('起止时间 due 取结束日 23:59', () => {
    const { tasks } = parseNotice('请于9月1日起至12月30日完成课程学习。', REF)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].dueAt).toBe(at(12, 30, 23, 59))
  })

  it('起止时间带结束钟点时按结束钟点', () => {
    const { tasks } = parseNotice('请于9月1日至12月30日18:00完成课程学习。', REF)
    expect(tasks[0].dueAt).toBe(at(12, 30, 18, 0))
  })

  it('URL 不当地点、不占标题', () => {
    const { tasks } = parseNotice('请于11月10日前到 https://example.com/a 提交材料。', REF)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].location).toBeNull()
    expect(tasks[0].channel).toBeNull()
    expect(tasks[0].title).not.toContain('http')
  })

  it('地点：显式写法优先，教材不会被当成「教」地点', () => {
    expect(parseNotice('请于11月10日前到地点：食堂三楼 提交材料。', REF).tasks[0].location).toBe('食堂三楼')
    expect(parseNotice('请于11月10日前统计缺页教材数量并反馈。', REF).tasks[0].location).toBeNull()
  })

  it.each([
    ['请于11月10日前到食堂集合。', '食堂'],
    ['请于11月10日前到操场集合。', '操场'],
    ['请于11月10日前到宿舍楼下领取材料。', '宿舍'],
    ['请于11月10日前到行政楼交表。', '行政楼'],
    ['请于11月10日前到办公室签字。', '办公室'],
    ['请于11月10日前到门口集合。', '门口'],
  ])('地点规则：%s → %s', (raw, location) => {
    expect(parseNotice(raw, REF).tasks[0].location).toBe(location)
  })

  it('会议号不是地点', () => {
    const { tasks } = parseNotice('请于11月10日10:00开会，会议号 123-456-789。', REF)
    expect(tasks[0].location).toBeNull()
  })

  it('同一天同 kind 且标题高度重叠 → 合并 1 条', () => {
    const raw = '请于11月10日23:59前统计缺页教材数量并反馈（留存影像）。统计本班缺页教材数量并反馈（留存影像）。'
    const { tasks } = parseNotice(raw, REF)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toContain('统计缺页教材数量并反馈')
  })

  it('两个不同截止时间保留两条', () => {
    const raw = '请于11月5日23:59前提交A表。请于12月30日23:59前提交B报告。'
    expect(parseNotice(raw, REF).tasks).toHaveLength(2)
  })

  it('同一天但类型不同不合并', () => {
    const raw = '11月10日23:59前提交实验报告。11月10日10:00开班会。'
    expect(parseNotice(raw, REF).tasks).toHaveLength(2)
  })

  it('同一天同 kind 但标题不重叠不合并', () => {
    const raw = '11月10日23:59前提交语文作业。11月10日23:59前提交数学作业。'
    expect(parseNotice(raw, REF).tasks).toHaveLength(2)
  })

  it('平台名作为提交渠道仍可识别', () => {
    const { tasks } = parseNotice('请于11月10日前在学习通提交实验报告三。', REF)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].channel).toBe('学习通')
  })

  it('网址里的平台名不算渠道', () => {
    const { tasks } = parseNotice('请于11月10日前完成学习，平台：https://mooc.example.com/military', REF)
    expect(tasks[0].channel).toBeNull()
  })

  it('中文编号与各班前缀从标题里剥掉', () => {
    expect(parseSegment('一、请各班统计缺页教材数量并于11月10日前反馈。', REF, 0)?.title).toBe(
      '统计缺页教材数量并反馈',
    )
  })
})
