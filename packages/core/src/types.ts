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
    /** 相关链接（仅 http/https）；null = 没有 */
    url?: string | null
    /** 备注：报名要求、温馨提示等；null = 没有 */
    note?: string | null
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
  /** 结束时刻（不含），与 ICS DTEND 一致；null = 点事件 */
  endAt?: number | null
  /** 全天事件 */
  allDay?: boolean
  /** 规范化 RRULE（创建系列用）；null = 非重复 */
  rrule?: string | null
  /** 所属重复系列；null = 非重复 */
  seriesId?: string | null
  /** 实例序号（从 0 开始），用于 COUNT 与幂等 */
  recurrenceIndex?: number
  /** 「跳过这一次」的标记（不等于完成，不进完成率分母） */
  skipped?: boolean
  /** 标签（普通字段，不加 DB 索引；搜索全表扫） */
  tags?: string[]
}

/** 重复系列：规则与系列级状态（每条实例只引用 seriesId） */
export interface TaskSeries {
  id: string
  /** 规范化 RRULE 子集，不带 RRULE: 前缀 */
  rrule: string
  /** MONTHLY 锚定日（原始日，如 31；短月 clamp 后仍然回到 31） */
  anchorDay?: number | null
  /** WEEKLY 锚定星期（1=周一…7=周日） */
  anchorWeekday?: number | null
  /** 首次实例的开始时刻（也用于导出 DTSTART） */
  startAt: number
  /** 结束时刻（exclusive），null = 点事件 */
  endAt?: number | null
  allDay?: boolean
  title: string
  kind: TaskKind
  channel?: string | null
  location?: string | null
    url?: string | null
    note?: string | null
  /** COUNT（含首次）；null = 不限 */
  count?: number | null
  /** UNTIL（含当天）；null = 不限 */
  until?: number | null
  createdAt: number
  /** 结束系列的时刻；非 null 表示不再生成 */
  endedAt?: number | null
  /** 系列标签（改整个系列时同步到实例） */
  tags?: string[]
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
