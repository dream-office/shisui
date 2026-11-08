
import type { TaskKind } from 'shisui-core'

/** 候选卡片上的类型/置信度文案（key 也是 i18n 字典 key） */
export const KIND_LABEL: Record<TaskKind, string> = {
  task: '任务',
  meeting: '会议',
  review: '评审',
  signup: '报名',
  payment: '缴费 / 报销',
  approval: '审批',
  survey: '问卷',
  exam: '考试',
  other: '其他',
}

export const CONF_LABEL = {
  high: '高置信',
  medium: '待核对',
  low: '需确认',
} as const
