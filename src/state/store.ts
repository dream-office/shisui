/**
 * 状态编排层：把「解析 → 合并 → 确认 → 落库」这条业务流串起来。
 * UI 只读状态、调 action，不写业务分支 —— 这是 AI 生成代码最容易糊在一起的地方，
 * 所以刻意切成 core / data / services / state / ui 五层。
 */
import { version as appVersion } from '../../package.json'
import { create } from 'zustand'
import {
  buildBackup,
  clockOf,
  sortFocusQueue,
  withClock,
  buildNextInstance,
  normalizeTags,
  validateBackup,
  createManualTask,
  mergeIcsImport,
  mergeTasks,
  parseNoticeBatch,
  parseRRule,
  splitNoticeSections,
} from 'shisui-core'
import { parseNotice } from 'shisui-core'
import type { ImportBatch, ManualTaskInput, ParsedTask, StoredTask, TaskSeries } from 'shisui-core'
import * as repo from '@/data/repo'
import { isLLMReady, loadLLMConfig, parseWithLLM, saveLLMConfig, type LLMConfig } from '@/services/llm'

export type View = 'inbox' | 'plan' | 'calendar' | 'stats' | 'settings'

interface AppState {
  view: View
  tasks: StoredTask[]
  hydrated: boolean
  candidates: ParsedTask[]
  warnings: string[]
  parsing: boolean
  /** 解析过程中的实时状态文案，直接展示给用户看 */
  stage: string
  engineNote: string | null
  llmConfig: LLMConfig
  /** 导入历史：每次「全部收录」都会留一条，可回看与二次收录 */
  history: ImportBatch[]
  /** 是否处于「多段粘贴」批量模式（预览列表改为勾选式） */
  batchMode: boolean
  /** 重复系列（规则在系列上，实例只引用 seriesId） */
  series: TaskSeries[]
  /** 搜索框（标题/原文/地点/标签；支持 #tag） */
  searchQuery: string
  /** 批量多选 */
  selectedIds: string[]
  /** 最近一次批量操作的撤销快照（内存，刷新后失效） */
  undo: { label: string; before: StoredTask[]; generatedIds?: string[] } | null
  /** 专注模式 */
  focusMode: boolean
  focusIndex: number

  setView: (view: View) => void
  hydrate: () => Promise<void>
  loadHistory: () => Promise<void>
  /** 完成：重复任务会同时生成下一条（同事务、幂等） */
  completeTask: (id: string) => Promise<void>
  /** 跳过这一次：标 skipped 并生成下一条 */
  skipTask: (id: string) => Promise<void>
  /** 结束系列：停止生成、保留历史 */
  endSeries: (id: string) => Promise<void>
  setSearchQuery: (query: string) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void
  selectAll: (ids: string[]) => void
  batchSetDone: (ids: string[], done: boolean) => Promise<void>
  batchDelete: (ids: string[]) => Promise<void>
  undoLastBatch: () => Promise<void>
  exportBackup: () => string
  restoreBackup: (text: string) => Promise<{ ok: boolean; errors: string[]; counts?: { tasks: number; series: number; batches: number } }>
  setTags: (id: string, tags: string[]) => Promise<void>
  /** 改这一次：只改当前实例（含时间），不动 series */
  editTaskFields: (id: string, fields: TaskEditFields) => Promise<void>
  /** 改整个系列：series + 当前/未来未完成实例；历史不动 */
  editSeriesFields: (id: string, fields: TaskEditFields) => Promise<void>
  openFocus: () => void
  closeFocus: () => void
  focusNext: () => void
  focusComplete: () => Promise<void>
  focusSkip: () => Promise<void>
  parse: (raw: string) => Promise<void>
  addManualTask: (input: ManualTaskInput) => Promise<void>
  /** 把任务挪到某一天：只改日期，保留原时刻；全天任务保持 00:00 */
  moveTaskToDay: (id: string, targetDayStart: number) => Promise<void>
  /** 导入 ICS 解析结果：按 sourceUid 去重，一个事务写入，返回三个计数 */
  importIcsTasks: (parsed: ParsedTask[]) => Promise<{ added: number; updated: number; skipped: number }>
  updateCandidate: (id: string, patch: Partial<ParsedTask>) => void
  dismissCandidate: (id: string) => void
  acceptCandidates: (ids: string[]) => Promise<void>
  toggleDone: (id: string) => Promise<void>
  patchTask: (id: string, patch: Partial<StoredTask>, editedField?: string) => Promise<void>
  dropTask: (id: string) => Promise<void>
  clearAll: () => Promise<void>
  saveLLM: (config: LLMConfig) => void
}

/** 编辑任务字段（改这一次 / 改整个系列共用） */
export interface TaskEditFields {
  title?: string
  kind?: ParsedTask['kind']
  channel?: string | null
  location?: string | null
  tags?: string[]
  /** 主时刻（仅改这一次支持） */
  primaryTime?: number | null
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

/** 重复任务：算下一条实例（不写库） */
async function buildPlan(task: StoredTask): Promise<{ nextTask: ParsedTask | null; seriesPatch?: Partial<TaskSeries> }> {
  if (!task.seriesId) return { nextTask: null }
  const series = await repo.getSeries(task.seriesId)
  if (!series) return { nextTask: null }
  const rule = parseRRule(series.rrule)
  if (!rule) return { nextTask: null }

  const nextTask = buildNextInstance(
    {
      id: task.id,
      title: task.title,
      kind: task.kind,
      channel: task.channel,
      location: task.location,
      rawText: task.rawText,
      startAt: task.startAt,
      dueAt: task.dueAt,
      endAt: task.endAt ?? null,
      allDay: task.allDay ?? false,
      seriesId: task.seriesId,
      recurrenceIndex: task.recurrenceIndex ?? 0,
    },
    rule,
    { nextId: `rec_${Date.now()}_${(task.recurrenceIndex ?? 0) + 1}`, seriesEnded: Boolean(series.endedAt) },
  )

  return {
    nextTask: nextTask
      ? {
          ...nextTask,
          kind: nextTask.kind as ParsedTask['kind'],
          confidence: 'high',
          reasons: ['由重复规则生成'],
          engine: 'rule',
          rrule: null,
        }
      : null,
  }
}

export const useApp = create<AppState>((set, get) => ({
  view: 'inbox',
  tasks: [],
  hydrated: false,
  candidates: [],
  warnings: [],
  parsing: false,
  stage: '',
  engineNote: null,
  llmConfig: loadLLMConfig(),
  history: [],
  batchMode: false,
  series: [],
  searchQuery: '',
  selectedIds: [],
  undo: null,
  focusMode: false,
  focusIndex: 0,

  setView: (view) => set({ view }),

  hydrate: async () => {
    const [tasks, history, series] = await Promise.all([repo.listTasks(), repo.listBatches(), repo.listSeries()])
    set({ tasks, history, series, hydrated: true })
  },

  loadHistory: async () => {
    set({ history: await repo.listBatches() })
  },

  addManualTask: async (input) => {
    const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const task = createManualTask(input, id)
    await repo.insertTasks([task])
    set({ tasks: await repo.listTasks() })
  },

  moveTaskToDay: async (id, targetDayStart) => {
    const task = get().tasks.find((item) => item.id === id)
    if (!task) return

    const primary = task.startAt ?? task.dueAt
    if (primary === null) {
      // 没有时间信息的任务：直接落到目标日的 00:00（视为全天）
      await repo.updateTask(id, { dueAt: targetDayStart, editedField: 'dueAt' })
      set({ tasks: await repo.listTasks() })
      return
    }

    const at = new Date(primary)
    const allDay = task.allDay === true || (at.getHours() === 0 && at.getMinutes() === 0 && at.getSeconds() === 0)
    const oldDayStart = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
    const delta = allDay
      ? targetDayStart - oldDayStart
      : (() => {
          const target = new Date(targetDayStart)
          target.setHours(at.getHours(), at.getMinutes(), at.getSeconds(), at.getMilliseconds())
          return target.getTime() - primary
        })()

    const patch: Partial<StoredTask> = {}
    if (task.startAt !== null) patch.startAt = task.startAt + delta
    if (task.dueAt !== null) patch.dueAt = task.dueAt + delta
    // 整段拖拽：结束时刻同步平移，区间长度不变（[start, end) 半开区间）
    if (task.endAt !== null && task.endAt !== undefined) patch.endAt = task.endAt + delta
    await repo.updateTask(id, { ...patch, editedField: 'dueAt' })
    set({ tasks: await repo.listTasks() })
  },

  completeTask: async (id) => {
    const task = get().tasks.find((item) => item.id === id)
    if (!task) return

    // 非重复任务：沿用简单勾选
    if (!task.seriesId || task.done) {
      await repo.setDone(id, true)
      set({ tasks: await repo.listTasks() })
      return
    }

    const plan = await buildPlan(task)
    await repo.settleRecurringInstance({ taskId: id, mode: 'done', nextTask: plan.nextTask, seriesPatch: plan.seriesPatch })
    set({ tasks: await repo.listTasks(), series: await repo.listSeries() })
  },

  skipTask: async (id) => {
    const task = get().tasks.find((item) => item.id === id)
    if (!task) return
    // 非重复任务：只标 skipped（历史保留、专注队列排除），不生成下一条
    if (!task.seriesId) {
      await repo.updateTask(id, { skipped: true, done: false, editedField: 'skipped' })
      set({ tasks: await repo.listTasks() })
      return
    }
    const plan = await buildPlan(task)
    await repo.settleRecurringInstance({ taskId: id, mode: 'skip', nextTask: plan.nextTask, seriesPatch: plan.seriesPatch })
    set({ tasks: await repo.listTasks(), series: await repo.listSeries() })
  },

  endSeries: async (id) => {
    const task = get().tasks.find((item) => item.id === id)
    if (!task || !task.seriesId) return
    await repo.endSeries(task.seriesId, task.recurrenceIndex ?? 0)
    set({ tasks: await repo.listTasks(), series: await repo.listSeries() })
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleSelection: (id) => {
    const selected = get().selectedIds
    set({
      selectedIds: selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id],
    })
  },

  clearSelection: () => set({ selectedIds: [] }),

  selectAll: (ids) => set({ selectedIds: [...ids] }),

  batchSetDone: async (ids, done) => {
    const current = get().tasks
    const before = current.filter((task) => ids.includes(task.id)).map((task) => ({ ...task }))
    if (before.length === 0) return
    const beforeIds = new Set(before.map((task) => task.id))

    // 完成时复用单条完成语义：重复任务会生成下一条；这些新实例必须进撤销范围，
    // 否则撤销后留下「幽灵下一条」
    for (const task of before) {
      if (done) {
        await get().completeTask(task.id)
      } else {
        await repo.setDone(task.id, false)
      }
    }

    const after = await repo.listTasks()
    const generatedIds = after
      .filter((task) => !beforeIds.has(task.id) && !task.done)
      .map((task) => task.id)

    set({
      tasks: after,
      selectedIds: [],
      undo: {
        label: done ? `批量完成 ${before.length} 件` : `批量取消完成 ${before.length} 件`,
        before,
        generatedIds: done ? generatedIds : [],
      },
    })
  },

  batchDelete: async (ids) => {
    const current = get().tasks
    const before = current.filter((task) => ids.includes(task.id)).map((task) => ({ ...task }))
    if (before.length === 0) return
    await Promise.all(before.map((task) => repo.removeTask(task.id)))
    set({
      tasks: await repo.listTasks(),
      selectedIds: [],
      undo: { label: `批量删除 ${before.length} 件`, before },
    })
  },

  undoLastBatch: async () => {
    const undo = get().undo
    if (!undo) return
    // 先删掉批量操作生成的下一条，再恢复原快照，活跃实例数回到操作前
    for (const id of undo.generatedIds ?? []) {
      await repo.removeTask(id)
    }
    await repo.bulkPutTasks(undo.before)
    set({ tasks: await repo.listTasks(), series: await repo.listSeries(), undo: null })
  },

  exportBackup: () => {
    const state = get()
    const llm = state.llmConfig
    const backup = buildBackup({
      appVersion,
      tasks: state.tasks,
      series: state.series,
      batches: state.history,
      // 只导出非敏感设置：apiKey 永远不进备份
      settings: { llm: { baseUrl: llm.endpoint, model: llm.model } },
    })
    return JSON.stringify(backup, null, 2)
  },

  restoreBackup: async (text) => {
    const result = validateBackup(text)
    if (!result.ok || !result.backup) return { ok: false, errors: result.errors }
    await repo.replaceAll({
      tasks: result.backup.tasks,
      series: result.backup.series,
      batches: result.backup.batches,
    })
    set({
      tasks: await repo.listTasks(),
      series: await repo.listSeries(),
      history: await repo.listBatches(),
      selectedIds: [],
      undo: null,
    })
    return {
      ok: true,
      errors: [],
      counts: {
        tasks: result.backup.tasks.length,
        series: result.backup.series.length,
        batches: result.backup.batches.length,
      },
    }
  },

  setTags: async (id, tags) => {
    await repo.updateTask(id, { tags: normalizeTags(tags), editedField: 'tags' })
    set({ tasks: await repo.listTasks() })
  },

  editTaskFields: async (id, fields) => {
    const current = get().tasks.find((task) => task.id === id)
    if (!current) return
    const patch: Partial<StoredTask> = {}
    if (fields.title !== undefined) patch.title = fields.title.trim()
    if (fields.kind !== undefined) patch.kind = fields.kind
    if (fields.channel !== undefined) patch.channel = fields.channel?.trim() || null
    if (fields.location !== undefined) patch.location = fields.location?.trim() || null
    if (fields.tags !== undefined) patch.tags = normalizeTags(fields.tags)

    // 改这一次的时间：只动当前实例；区间任务整体平移保持时长
    if (fields.primaryTime !== undefined && fields.primaryTime !== null) {
      const oldPrimary = current.startAt ?? current.dueAt
      if (oldPrimary !== null) {
        const delta = fields.primaryTime - oldPrimary
        if (current.startAt !== null) patch.startAt = fields.primaryTime
        if (current.dueAt !== null) patch.dueAt = fields.primaryTime
        if (current.endAt !== null && current.endAt !== undefined) patch.endAt = current.endAt + delta
      }
    }

    await repo.updateTask(id, { ...patch, editedField: 'title' })
    set({ tasks: await repo.listTasks() })
  },

  editSeriesFields: async (id, fields) => {
    const current = get().tasks.find((task) => task.id === id)
    if (!current || !current.seriesId) return
    const seriesPatch: Partial<TaskSeries> = {}
    const taskPatch: Partial<StoredTask> = {}
    if (fields.title !== undefined) {
      seriesPatch.title = fields.title.trim()
      taskPatch.title = fields.title.trim()
    }
    if (fields.kind !== undefined) {
      seriesPatch.kind = fields.kind
      taskPatch.kind = fields.kind
    }
    if (fields.channel !== undefined) {
      seriesPatch.channel = fields.channel?.trim() || null
      taskPatch.channel = fields.channel?.trim() || null
    }
    if (fields.location !== undefined) {
      seriesPatch.location = fields.location?.trim() || null
      taskPatch.location = fields.location?.trim() || null
    }
    if (fields.tags !== undefined) {
      seriesPatch.tags = normalizeTags(fields.tags)
      taskPatch.tags = normalizeTags(fields.tags)
    }
    // 改整个系列改时间：只改时刻、日期不变，频率/anchor 不动
    const clockEdits: Array<{ id: string; startAt?: number | null; dueAt?: number | null; endAt?: number | null }> = []
    if (fields.primaryTime !== undefined && fields.primaryTime !== null) {
      const clock = clockOf(fields.primaryTime)
      const series = await repo.getSeries(current.seriesId)
      if (series) seriesPatch.startAt = withClock(series.startAt, clock)
      // 当前 + 未来未完成（与 repo 同步规则一致）逐个换时刻
      for (const task of get().tasks) {
        if (task.seriesId !== current.seriesId) continue
        if ((task.recurrenceIndex ?? 0) < (current.recurrenceIndex ?? 0)) continue
        if (task.done || task.skipped) continue
        const oldPrimary = task.startAt ?? task.dueAt
        if (oldPrimary === null) continue
        const nextPrimary = withClock(oldPrimary, clock)
        const delta = nextPrimary - oldPrimary
        clockEdits.push({
          id: task.id,
          startAt: task.startAt !== null ? nextPrimary : null,
          dueAt: task.dueAt !== null ? nextPrimary : null,
          endAt: task.endAt !== null && task.endAt !== undefined ? task.endAt + delta : task.endAt,
        })
      }
    }
    await repo.editSeriesAndInstances({
      seriesId: current.seriesId,
      fromIndex: current.recurrenceIndex ?? 0,
      seriesPatch,
      taskPatch,
      clockEdits,
    })
    set({ tasks: await repo.listTasks(), series: await repo.listSeries() })
  },

  openFocus: () => set({ focusMode: true, focusIndex: 0 }),
  closeFocus: () => set({ focusMode: false }),
  focusNext: () => set((state) => ({ focusIndex: state.focusIndex + 1 })),

  focusComplete: async () => {
    const state = get()
    const active = sortFocusQueue(state.tasks)
    const task = active[state.focusIndex]
    if (!task) return
    await state.completeTask(task.id)
    set({ focusIndex: 0 })
  },

  focusSkip: async () => {
    const state = get()
    const active = sortFocusQueue(state.tasks)
    const task = active[state.focusIndex]
    if (!task) return
    // 普通任务也落 skipped=true（历史保留、专注队列排除），不生成下一条
    await state.skipTask(task.id)
    set({ focusIndex: 0 })
  },

  importIcsTasks: async (parsed) => {
    const existing = get().tasks
    const plain = parsed.filter((task) => !task.rrule)
    const recurring = parsed.filter((task) => task.rrule)

    // 普通事件：按 sourceUid 去重（新增/更新）
    const plan = mergeIcsImport(
      existing.map((task) => ({ id: task.id, sourceUid: task.sourceUid ?? null })),
      plain,
    )
    await repo.applyIcsPlan(plan)

    // 重复事件：创建系列 + 首条实例（不展开实例）
    for (const task of recurring) {
      const rule = parseRRule(task.rrule!)
      const seriesId = `series_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const primary = task.startAt ?? task.dueAt ?? Date.now()
      await repo.createSeriesWithTask(
        {
          id: seriesId,
          rrule: task.rrule!,
          anchorDay: rule?.anchorDay ?? null,
          anchorWeekday: rule?.anchorWeekday ?? null,
          startAt: primary,
          endAt: task.endAt ?? null,
          allDay: task.allDay ?? false,
          title: task.title,
          kind: task.kind,
          channel: task.channel,
          location: task.location,
          count: rule?.count ?? null,
          until: rule?.until ?? null,
          createdAt: Date.now(),
          endedAt: null,
        },
        { ...task, seriesId, recurrenceIndex: 0, rrule: null },
      )
    }

    set({ tasks: await repo.listTasks(), series: await repo.listSeries() })
    return {
      added: plan.toInsert.length + recurring.length,
      updated: plan.toUpdate.length,
      skipped: plan.skipped.length,
    }
  },

  parse: async (raw) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      set({ warnings: ['先贴一段通知进来吧'], candidates: [], engineNote: null, batchMode: false })
      return
    }

    set({ parsing: true, stage: '规则引擎正在切分通知…', warnings: [], candidates: [], engineNote: null, batchMode: false })
    await nextTick()

    const ref = new Date()

    // 多段粘贴：一次贴进多段通知时按段解析、批内去重（批量模式只用规则引擎，避免逐段调 AI）
    const sections = splitNoticeSections(trimmed)
    if (sections.length > 1) {
      const batch = parseNoticeBatch(trimmed, ref)
      set({
        candidates: batch.tasks,
        warnings: batch.warnings,
        parsing: false,
        stage: '',
        batchMode: true,
        engineNote: `批量模式：${batch.sections} 段 → ${batch.tasks.length} 条（去重 ${batch.duplicates.length} 条）`,
      })
      return
    }

    const ruleResult = parseNotice(trimmed, ref)
    const warnings = [...ruleResult.warnings]
    let tasks = ruleResult.tasks
    let engineNote = `规则引擎识别 ${ruleResult.tasks.length} 条`

    const config = get().llmConfig
    if (isLLMReady(config)) {
      set({ stage: 'AI 正在阅读通知…' })
      try {
        const llmTasks = await parseWithLLM(trimmed, ref, config, (progress) => {
          if (progress.phase === 'streaming') {
            set({ stage: `AI 正在写结构化结果… 已收 ${progress.chars} 字` })
          } else if (progress.phase === 'done') {
            set({ stage: 'AI 输出完成，正在合并…' })
          }
        })
        const report = mergeTasks(ruleResult.tasks, llmTasks)
        tasks = report.tasks
        engineNote = `规则 ${report.ruleCount} 条 + AI ${report.llmCount} 条 → 合并后 ${report.tasks.length} 条（${report.agreedCount} 条双引擎一致，${report.llmOnlyCount} 条 AI 补充）`
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误'
        warnings.push(`AI 引擎没跑通（${message}），已自动回退到规则引擎，功能不受影响`)
      }
    }

    set({ candidates: tasks, warnings, parsing: false, stage: '', engineNote })
  },

  updateCandidate: (id, patch) => {
    set((state) => ({
      candidates: state.candidates.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    }))
  },

  dismissCandidate: (id) => {
    set((state) => ({ candidates: state.candidates.filter((task) => task.id !== id) }))
  },

  acceptCandidates: async (ids) => {
    const state = get()
    const picked = state.candidates.filter((task) => ids.includes(task.id))
    if (picked.length === 0) return

    const plain: ParsedTask[] = []
    for (const task of picked) {
      if (!task.rrule) {
        plain.push(task)
        continue
      }
      // 带重复规则的候选：创建系列 + 首条实例（同一事务）
      const rule = parseRRule(task.rrule)
      const seriesId = `series_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const primary = task.startAt ?? task.dueAt ?? Date.now()
      await repo.createSeriesWithTask(
        {
          id: seriesId,
          rrule: task.rrule,
          anchorDay: rule?.anchorDay ?? null,
          anchorWeekday: rule?.anchorWeekday ?? null,
          startAt: primary,
          endAt: task.endAt ?? null,
          allDay: task.allDay ?? false,
          title: task.title,
          kind: task.kind,
          channel: task.channel,
          location: task.location,
          count: rule?.count ?? null,
          until: rule?.until ?? null,
          createdAt: Date.now(),
          endedAt: null,
        },
        { ...task, seriesId, recurrenceIndex: 0, rrule: null },
      )
    }
    if (plain.length > 0) await repo.insertTasks(plain)
    await repo.recordBatch({
      id: `batch_${Date.now()}`,
      rawText: picked.map((task) => task.rawText).join('\n'),
      createdAt: Date.now(),
      taskCount: picked.length,
      engine: picked.some((t) => t.engine === 'rule') && picked.some((t) => t.engine !== 'rule') ? 'hybrid' : picked[0].engine === 'rule' ? 'rule' : 'llm',
    })
    const tasks = await repo.listTasks()
    const history = await repo.listBatches()
    const series = await repo.listSeries()
    set({ tasks, history, series, candidates: state.candidates.filter((task) => !ids.includes(task.id)) })
  },

  toggleDone: async (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task) return
    // 重复任务：完成时走「完成 + 生成下一条」的幂等事务
    if (task.seriesId && !task.done) {
      await get().completeTask(id)
      return
    }
    await repo.setDone(id, !task.done)
    set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
  },

  patchTask: async (id, patch, editedField) => {
    await repo.updateTask(id, { ...patch, editedField })
    const tasks = await repo.listTasks()
    set({ tasks })
  },

  dropTask: async (id) => {
    await repo.removeTask(id)
    set({ tasks: get().tasks.filter((t) => t.id !== id) })
  },

  clearAll: async () => {
    await repo.clearAll()
    set({ tasks: [], candidates: [], warnings: [], engineNote: null })
  },

  saveLLM: (config) => {
    saveLLMConfig(config)
    set({ llmConfig: config })
  },
}))
