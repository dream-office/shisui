# shisui-core · 拾穗核心

拾穗（shisui）里「跟界面无关」的那部分，抽出来单独发的包：

- **中文口语时间归一化**：`本周五23:59`、`下周三`、`明晚8点`、`中午12点`、`3天内`、`八点半`、`下下周一`
- **通知 → 待办**：把一段群通知拆成任务，带绝对时间、类型、渠道、置信度
- **冲突体检**：逾期 / 两小时内撞车 / 同一天三件以上 / 一周负载

纯函数，**零运行时依赖**，不碰 DOM、不碰网络、不碰存储。浏览器、Node、任何 JS 环境都能用。

## 用法

```ts
import { parseNotice, scanConflicts, extractTime } from 'shisui-core'

// 「现在」必须显式传入（ref）——这样同一份输入在任何时刻跑，结果都一样
const ref = new Date(2026, 10, 4, 22, 7)

const { tasks, warnings } = parseNotice('本周五23:59前把材料交到学习通', ref)

tasks[0].title      // '把材料交到学习通'
tasks[0].dueAt      // number | null —— epoch 毫秒，不是 Date
tasks[0].kind       // 'task' | 'meeting' | 'review' | 'signup' | 'payment'
                    // | 'approval' | 'survey' | 'exam' | 'other'
tasks[0].confidence // 'high' | 'medium' | 'low'
tasks[0].reasons    // 判定理由，可以直接展示给用户
warnings            // string[]：解析时发现的可疑之处

const notes = scanConflicts(tasks, ref)
notes[0]            // { id, level: 'danger' | 'warn' | 'info',
                    //   title, detail, taskIds }

// 只想要「一句话里的时间」也可以单独用
extractTime('明晚8点开会', ref)   // { atMs, isDeadline, ambiguous, ... }
```

## 许可

```
shisui-core    → MIT（本包，可复用的解析核心）
shisui         → AGPL-3.0-or-later（应用本体，完整产品）
```

解析能力是通用基础设施，不该被 copyleft 绑住；应用是完整产品，AGPL 依然合理。

## 开发

```bash
pnpm --filter shisui-core build    # 出 dist/ + .d.ts（发布用的就是这份）
```

- 源码在 `src/`，测试在 `src/*.test.ts`，**在仓库内随源码跑**（npm 包里只有 `dist/`，不含测试）。
- 本包在仓库里以 workspace 方式开发，构建依赖根 workspace 的 TypeScript。

## 已知边界

- 解析是**规则引擎**，不是大模型：拿不准时会给出较低 `confidence`，不会瞎猜。
- 时间归一化依赖「当前时间」作为基准，调用时**必须显式传入 `ref: Date`** —— 这样测试才可复现。
- 只覆盖中文常见口语表达，方言 / 英文时间表达式不在范围内。
