/**
 * 状态编排层：把「解析 → 合并 → 确认 → 落库」这条业务流串起来。
 * UI 只读状态、调 action，不写业务分支 —— 这是 AI 生成代码最容易糊在一起的地方，
 * 所以刻意切成 core / data / services / state / ui 五层。
 */
import { create } from 'zustand'
import { mergeTasks } from '@/core/merge'
import { parseNotice } from '@/core/ruleParser'
import type { ParsedTask, StoredTask } from '@/core/types'
import * as repo from '@/data/repo'
import { isLLMReady, loadLLMConfig, parseWithLLM, saveLLMConfig, type LLMConfig } from '@/services/llm'

export type View = 'inbox' | 'plan' | 'settings'

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

  setView: (view: View) => void
  hydrate: () => Promise<void>
  parse: (raw: string) => Promise<void>
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

  setView: (view) => set({ view }),

  hydrate: async () => {
    const tasks = await repo.listTasks()
    set({ tasks, hydrated: true })
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
    set({ tasks, candidates: state.candidates.filter((task) => !ids.includes(task.id)) })
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
