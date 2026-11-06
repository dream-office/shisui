# shisui-core · 拾穗核心

拾穗（shisui）里「跟界面无关」的那部分，抽出来单独发的包：

- **中文口语时间归一化**：`本周五23:59`、`下周三`、`明晚8点`、`中午12点`、`3天内`、`八月半`、`下下周一`
- **通知 → 待办**：把一段群通知拆成任务，带绝对时间、类型、渠道、置信度
- **冲突体检**：逾期 / 两小时内撞车 / 同一天三件以上 / 一周负载

纯函数，**零运行时依赖**，不碰 DOM、不碰网络、不碰存储。浏览器、Node、任何 JS 环境都能用。

```ts
import { parseNotice, scanConflicts, formatWhen } from 'shisui-core'

const parsed = parseNotice('本周五23:59前把材料交到学习通', new Date())
// parsed.tasks[0].dueAt → Date，parsed.tasks[0].kind → 'general' …

const notes = scanConflicts(myTasks, new Date())
// [{ level: 'danger', message: '两小时内有两件事' }, …]
```

## 许可

**MIT**。应用本体（`shisui`）是 AGPL-3.0-or-later；这个核心包是 MIT ——
**解析能力是通用基础设施，不该被 copyleft 绑住**。

```
@dream-office/shisui  → AGPL-3.0-or-later（完整产品）
shisui-core           → MIT（可复用的解析核心）
```

## 开发

```bash
pnpm --filter shisui-core build    # 出 dist/ + .d.ts
```

源码在 `src/`，测试是 `*.test.ts`（随包一起跑，见根目录 `vitest.config.ts`）。

## 已知边界

- 解析是**规则引擎**，不是大模型：拿不准时会给出较低 `confidence`，不会瞎猜。
- 时间归一化依赖「当前时间」作为基准，调用时**必须显式传入 `ref: Date`** —— 这样测试才可复现。
- 只覆盖中文常见口语表达，方言/英文时间表达式不在范围内。
