/**
 * 可本地化消息：core 只产出 code + params，不绑定语言。
 * 旧字符串字段继续保留（兼容旧 UI/备份/第三方调用），新 UI 优先渲染 codes。
 */
export interface LocalizedMessage {
  code: string
  params?: Record<string, string | number>
}

export function message(code: string, params?: Record<string, string | number>): LocalizedMessage {
  return params ? { code, params } : { code }
}

/** kind / channel 等标签的稳定子 code（供 tCore 递归翻译参数） */
export const KIND_CODE: Record<string, string> = {
  '考试/测验': 'kind.exam',
  '评审/验收': 'kind.review',
  '审批/确认': 'kind.approval',
  '会议/活动': 'kind.meeting',
  '任务/交付': 'kind.task',
  '报名/登记': 'kind.signup',
  '缴费/报销': 'kind.payment',
  '问卷/填表': 'kind.survey',
}

export const CHANNEL_CODE: Record<string, string> = {
  飞书: 'channel.feishu',
  钉钉: 'channel.dingtalk',
  企业微信: 'channel.wecom',
  'OA/审批系统': 'channel.oa',
  'Jira/Confluence': 'channel.jira',
  在线文档: 'channel.docs',
  学习通: 'channel.xuexitong',
  雨课堂: 'channel.yuketang',
  智慧树: 'channel.zhihuishu',
  教务系统: 'channel.jwxt',
  邮箱: 'channel.email',
  线上会议: 'channel.onlineMeeting',
  聊天群: 'channel.chat',
  '纸质/线下': 'channel.offline',
}


/** time.ts 里写进 hit.note 的假设，映射为稳定 code；未知 note 返回 undefined */
export function timeNoteCode(note?: string): LocalizedMessage | undefined {
  if (!note) return undefined
  if (note.includes('「月底」')) return message('time.monthEnd')
  if (note.includes('「下个月初」')) return message('time.nextMonthStart')
  const semester = /「学期末」.*（(\d{4}-\d{2})-15）/.exec(note)
  if (semester) return message('time.semesterEnd', { date: semester[1] + '-15' })
  const workdays = /「(.+?) 个工作日」/.exec(note)
  if (workdays) return message('time.workdayCount', { count: workdays[1] })
  if (note.includes('今天是工作日，未到 18:00')) return message('time.workdayToday')
  if (note.includes('已过 18:00')) return message('time.workdayNext')
  const monthly = /每月 (\d+) 号/.exec(note)
  if (monthly) return message('time.monthlyDay', { day: monthly[1] })
  if (note.includes('起止时间按结束日')) return message('time.rangeEnd2399')
  if (note.includes('该日期是周末')) return message('time.weekendShift')
  if (note.includes('按工作日 18:00 理解')) return message('time.workdayClock')
  return undefined
}
