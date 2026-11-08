/**
 * 领域类型：全部集中在这里，UI / 数据层 / 解析引擎都只依赖这一份定义。
 * 设计原则：core 层不 import 任何 React / Dexie / 浏览器 API，保证可单测、可移植。
 */

/**
 * 事项类型：刻意做成「跨场景」的一套，同一个人同一天可能既要交课程报告、
 * 又要回客户邮件、还要走报销，不能只按校园或只按办公来分类。
 */
export type TaskKind =
  | 'task' // 任务 / 交付物：作业、报告、周报、方案、PPT、材料
  | 'meeting' // 会议 / 活动：例会、复盘会、讲座、培训、宣讲
  | 'review' // 评审 / 验收：答辩、评审会、复核、验收
  | 'signup' // 报名 / 登记：报名、选课、接龙、抢名额
  | 'payment' // 缴费 / 报销：学费、报销、打款、对账
  | 'approval' // 审批 / 确认：审批、签批、签字、走流程
  | 'survey' // 问卷 / 填表：问卷、打卡、收集表、投票
  | 'exam' // 考试 / 测验：考试、补考、随堂测
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
  /** 谁解析出来的；manual = 用户手动添加，import = 从日历文件导入 */
  engine: 'rule' | 'llm' | 'hybrid' | 'manual' | 'import'
  /** 日历文件里的 UID：再导入同一事件时用于去重 / 更新；其它来源为 null */
  sourceUid?: string | null
  /** 二选一分组（「本周日」当天会产出两个候选，同组只能选一个） */
  choiceGroup?: string
  /** 该候选在组内的标签，如「本周」/「下周」 */
  choiceLabel?: string
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
