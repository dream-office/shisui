/**
 * 领域类型：全部集中在这里，UI / 数据层 / 解析引擎都只依赖这一份定义。
 * 设计原则：core 层不 import 任何 React / Dexie / 浏览器 API，保证可单测、可移植。
 */

/** 通知里能抽出来的事项类型 */
export type TaskKind =
  | 'homework' // 作业、实验报告、课程论文
  | 'exam' // 考试、测验、答辩
  | 'meeting' // 会议、班会、讲座、宣讲
  | 'signup' // 报名、抢票、选课
  | 'payment' // 缴费、报销
  | 'survey' // 问卷、打卡、填表
  | 'other'

/** 解析置信度：低置信度的候选会在 UI 里被高亮，强制人工确认 */
export type Confidence = 'high' | 'medium' | 'low'

/** 一条从通知里抽出来的待办 */
export interface ParsedTask {
  /** 本地生成的稳定 id（导入批次内唯一） */
  id: string
  /** 一句话标题，已剔除时间短语 */
  title: string
  /** 截止时间（epoch ms）：deadline 类事项的「必须完成前」 */
  dueAt: number | null
  /** 开始时间（epoch ms）：会议 / 考试这类有明确开始时刻的事项 */
  startAt: number | null
  kind: TaskKind
  /** 提交 / 参与渠道：学习通、雨课堂、邮箱、线下教室…… */
  channel: string | null
  /** 地点：教学楼 A301、线上腾讯会议…… */
  location: string | null
  /** 原文片段，永远保留，供用户核对 */
  rawText: string
  confidence: Confidence
  /** 可解释性：为什么给出这个判定，直接展示给用户 */
  reasons: string[]
  /** 谁解析出来的 */
  engine: 'rule' | 'llm'
}

/** 已确认、落地到日程的事项 */
export interface StoredTask extends ParsedTask {
  createdAt: number
  done: boolean
  /** 用户手动改过的字段（用于统计「AI 准确率」并生成演进报告） */
  editedFields: string[]
}

/** 一次导入（粘贴的一段群消息） */
export interface ImportBatch {
  id: string
  rawText: string
  createdAt: number
  taskCount: number
  engine: 'rule' | 'llm' | 'hybrid'
}
