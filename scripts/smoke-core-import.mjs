#!/usr/bin/env node
/**
 * 冒烟测试：确认 shisui-core 的发布产物能在 **Node ESM** 里被 import。
 *
 * 为什么需要它：2026-11-06 复核发现过一个真问题 ——
 * 产物 dist 里的相对导入没有 `.js` 扩展名，Vite 能忍，Node 直接 ERR_MODULE_NOT_FOUND。
 * 单元测试跑在 vitest（走 bundler 解析）里，**发现不了这个**。
 *
 * 前置：先 build 核心包（pnpm --filter shisui-core build）
 * 用法：node scripts/smoke-core-import.mjs
 */
const required = ['parseNotice', 'scanConflicts', 'extractTime', 'mergeTasks', 'countdown']

const mod = await import('shisui-core')

const missing = required.filter((name) => typeof mod[name] !== 'function')
if (missing.length > 0) {
  console.error(`[FAIL] Node 里 import('shisui-core') 缺少导出：${missing.join(', ')}`)
  process.exit(1)
}

const exported = Object.keys(mod).length
const { tasks } = mod.parseNotice('本周五23:59前把材料交到学习通', new Date(2026, 10, 4, 22, 7))
if (!Array.isArray(tasks) || tasks.length === 0) {
  console.error('[FAIL] parseNotice 在 Node 里没有返回任务')
  process.exit(1)
}

const dueAt = tasks[0].dueAt
if (dueAt !== null && typeof dueAt !== 'number') {
  console.error(`[FAIL] dueAt 应该是 epoch 毫秒或 null，实际是 ${typeof dueAt}`)
  process.exit(1)
}

console.log(`[OK] Node ESM 可用：${exported} 个导出；parseNotice 返回 ${tasks.length} 条；dueAt 类型 ${dueAt === null ? 'null' : 'number'}`)
