/**
 * 状态编排层：把「解析 → 合并 → 确认 → 落库」这条业务流串起来。
 * UI 只读状态、调 action，不写业务分支 —— 这是 AI 生成代码最容易糊在一起的地方，
 * 所以刻意切成 core / data / services / state / ui 五层。
 */
import { create } from 'zustand'
import { createManualTask, mergeIcsImport, mergeTasks } from 'shisui-core'
import { parseNotice } from 'shisui-core'
import type { ImportBatch, ManualTaskInput, ParsedTask, StoredTask } from 'shisui-core'
import * as repo from '@/data/repo'
import { isLLMReady, loadLLMConfig, parseWithLLM, saveLLMConfig, type LLMConfig } from '@/services/llm'

export type View = 'inbox' | 'plan' | 'calendar' | 'settings'

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

  setView: (view: View) => void
  hydrate: () => Promise<void>
  loadHistory: () => Promise<void>
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

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

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

  setView: (view) => set({ view }),

  hydrate: async () => {
    const [tasks, history] = await Promise.all([repo.listTasks(), repo.listBatches()])
    set({ tasks, history, hydrated: true })
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
    const allDay = at.getHours() === 0 && at.getMinutes() === 0 && at.getSeconds() === 0
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
    await repo.updateTask(id, { ...patch, editedField: 'dueAt' })
    set({ tasks: await repo.listTasks() })
  },

  importIcsTasks: async (parsed) => {
    const existing = get().tasks
    const plan = mergeIcsImport(
      existing.map((task) => ({ id: task.id, sourceUid: task.sourceUid ?? null })),
      parsed,
    )
    await repo.applyIcsPlan(plan)
    set({ tasks: await repo.listTasks() })
    return { added: plan.toInsert.length, updated: plan.toUpdate.length, skipped: plan.skipped.length }
  },

  parse: async (raw) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      set({ warnings: ['先贴一段通知进来吧'], candidates: [], engineNote: null })
      return
    }

    set({ parsing: true, stage: '规则引擎正在切分通知…', warnings: [], candidates: [], engineNote: null })
    await nextTick()

    const ref = new Date()
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
    await repo.insertTasks(picked)
    await repo.recordBatch({
      id: `batch_${Date.now()}`,
      rawText: picked.map((task) => task.rawText).join('\n'),
      createdAt: Date.now(),
      taskCount: picked.length,
      engine: picked.some((t) => t.engine === 'rule') && picked.some((t) => t.engine !== 'rule') ? 'hybrid' : picked[0].engine === 'rule' ? 'rule' : 'llm',
    })
    const tasks = await repo.listTasks()
    const history = await repo.listBatches()
    set({ tasks, history, candidates: state.candidates.filter((task) => !ids.includes(task.id)) })
  },

  toggleDone: async (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task) return
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
