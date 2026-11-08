# v0.8.0 设计：重复任务 + 多日/区间事件

> 状态：**设计待确认**（先交方案，确认后才写实现）
> 基线：main `c6959f8`（v0.7.0）；分支 `feat/v0.8.0`

---

## 0. 一句话范围

| 能力 | 做什么 | 不做什么 |
| --- | --- | --- |
| 重复任务 | 日/周/月三种频率、间隔、周几、次数/截止；完成当前实例 → 生成下一次 | 不做 YEARLY、BYMONTHDAY、BYMONTH、BYSETPOS、EXDATE、`RECURRENCE-ID` 全量支持 |
| 区间事件 | 加 `endAt`（**exclusive**）+ `allDay`；跨天/多日事件在月视图跨格显示 | 不做全天和定时混合、不做时区数据库、不做重复事件的实例展开导出 |

---

## 1. 数据模型

### 1.1 新增字段（`ParsedTask`，`StoredTask` 继承）

| 字段 | 类型 | 含义 | 备注 |
| --- | --- | --- | --- |
| `endAt` | `number \| null` | **结束时刻（不含）**，与 ICS `DTEND` 一致 | null = 点事件 |
| `allDay` | `boolean` | 是否为全天事件 | 新数据必填；老数据迁移推断 |
| `rrule` | `string \| null` | 规范化 RRULE 子集，如 `FREQ=WEEKLY;INTERVAL=1;BYDAY=FR;COUNT=5` | 不带 `RRULE:` 前缀 |
| `seriesId` | `string \| null` | 系列 id（同系列实例共享） | 新系列用 `series_<随机>`；ICS 导入用 `uid:<UID>` |
| `recurrenceIndex` | `number` | 实例序号，从 0 开始 | 用于 COUNT 判断与幂等 |
| `skipped` | `boolean` | 「跳过这一次」的标记 | 默认 false；完成率分母排除 |

### 1.2 时间形状（唯一权威表）

| 形状 | startAt | endAt | dueAt | allDay |
| --- | --- | --- | --- | --- |
| 截止类任务（交报告） | null | null | `t` | false |
| 定时事件（会议开始） | `t` | null | null | false |
| 区间事件（会议/出差，跨天） | `t1` | `t2`（> t1，exclusive） | null | false |
| 全天单日 | `t`（本地 00:00） | null（隐含 +1 天） | null | true |
| 全天多日 | `t1`（本地 00:00） | `t2`（次日 00:00，exclusive） | null | true |
| 重复实例 | 同上述四种之一 | 同左 | 同左 | 同左 |

**规则**：
- `startAt` 与 `dueAt` 互斥（同一任务不两者都填）；`endAt` 只能与 `startAt` 同时出现。
- 显示/排序/导出统一用「主时刻」= `startAt ?? dueAt`（沿用 v0.7 约定）。
- **老数据兼容**：历史上全天事件写成 `dueAt = 本地 00:00`；迁移时标 `allDay = true`、`endAt = null`、`startAt = null`，渲染与导出按上表第 4 行处理（`dueAt` 作为当天锚点）。新导入的全天事件写成规范形状（`startAt`/`endAt`）。**双形状并存是迁移的代价，已在 `daysBetween`/导出/统计里统一走 `allDayAnchor()` 辅助函数**。

### 1.3 系列存储：两方案（**推荐 B**）

**A. 实例自带规则（轻量）**
- 每个实例都是普通任务，各自存 `rrule/seriesId/recurrenceIndex`。
- 导出：取系列里 `recurrenceIndex` 最小的未完成实例带 `RRULE` 导出一次，其余实例导出为普通事件（或跳过）。
- 缺点：导出语义绕；`COUNT` 需要回读历史；「结束系列」要批量改多行。

**B. 独立 `series` 表（推荐）**
```
series: id, rrule, startAt, endAt, allDay, title, kind, channel, location,
        createdAt, count, until, endedAt?
```
- `tasks.seriesId` 只作引用；实例本身仍是普通任务（可直接完成/拖拽/编辑）。
- 导出：`series` 一条主事件带 `RRULE`，其已完成实例按 `EXDATE`（可选，先不做）或直接不导出。
- 生成下一次：读 `series` + 当前实例 `recurrenceIndex` → 算下一次。
- 「结束系列」= `series.endedAt = now`，并删除未完成的未来实例（如果有），已完成的保留历史。
- 代价：多一张表、多一次 join；DB v3 升级更直观（新表从空开始）。

**推荐 B**：语义干净、导出与结束系列都简单；A 只作为「今天必须上架」时的降级方案。

---

## 2. DB v3 迁移

```ts
// src/data/db.ts
this.version(3).stores({
  tasks: 'id, dueAt, startAt, endAt, done, kind, createdAt, sourceUid, seriesId, allDay',
  batches: 'id, createdAt',
  series: 'id, startedAt',
})
```

**升级函数**（纯函数放 core，Dexie 只调用它，便于单测）：

```ts
export function migrateTaskV2toV3(task: StoredTaskV2): StoredTaskV3 {
  const anchor = task.startAt ?? task.dueAt
  const isMidnight = anchor !== null && new Date(anchor).getHours() === 0 &&
    new Date(anchor).getMinutes() === 0 && new Date(anchor).getSeconds() === 0
  return {
    ...task,
    endAt: null,                    // 老数据没有区间
    allDay: task.allDay ?? isMidnight,
    rrule: null,
    seriesId: null,
    recurrenceIndex: 0,
    skipped: false,
  }
}
```

- **只补字段、不改已有值**：不把老 `dueAt` 搬到 `startAt`（避免全库改写）。
- `series` 新表从空开始；`seriesId` 索引建立。
- 迁移单测：点任务 / 全天（dueAt 00:00）/ 定时事件 / 已有 endAt 幂等 / 不丢字段。
- **回滚**：v3→v2 不需要（只加字段与表）；若必须回滚，Dexie 会保留 v2 结构，未识别字段被忽略。

---

## 3. 重复规则子集与算法

### 3.1 支持的写法

| 中文输入 | 规范化 rrule |
| --- | --- |
| 每天 / 每日 | `FREQ=DAILY` |
| 每隔两天 | `FREQ=DAILY;INTERVAL=2` |
| 每周五 | `FREQ=WEEKLY;BYDAY=FR` |
| 每两周的周一和周四 | `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH` |
| 每月1号 / 每月1日 | `FREQ=MONTHLY;BYMONTHDAY=1` |
| 每月15号，共5次 | `FREQ=MONTHLY;BYMONTHDAY=15;COUNT=5` |
| 每周一，到12月31日 | `FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959Z` |

### 3.2 下次出现算法（`nextOccurrence(series, afterMs)`）

1. 以**本地日历**推进（`setDate` / `setMonth`），保持墙上时间不变——DST 周不会漂 1 小时。
2. DAILY：`+INTERVAL` 天。
3. WEEKLY：从当前日期起逐日 +1，跳过不在 `BYDAY` 的星期；跨过 `INTERVAL` 周时整周跳过（等价于每周集合按 INTERVAL 周重复）。
4. MONTHLY：`+INTERVAL` 月；**日 > 当月最大日 → clamp 到月末**（1/31 → 2/28/29 → 3/31）。这是 RFC 兼容做法之一，需要确认（见待确认 ④）。
5. `COUNT`：实例数 = `count`；`recurrenceIndex + 1 >= count` → 不再生成。
6. `UNTIL`：下一次 `startAt > until` → 不再生成；`UNTIL` 为日期时按当天 23:59:59 本地处理。

### 3.3 边界用例（单测必须覆盖）

- 1/31 → 2/28（平年）/ 2/29（闰年）→ 3/31
- 12/31 → 次年 1/1（跨年）
- DST 开始/结束周（`TZ=America/New_York`）——下次实例的墙上时间不变
- `UNTIL` 刚好等于某次实例 → 该次仍生成（<=）
- `COUNT=1` → 完成后系列结束
- 每周日、每两周周日（与 v0.7 的「下周日」语义无关，按周起点周一算）

---

## 4. 完成 / 跳过 / 结束系列（语义）

| 操作 | 对当前实例 | 是否生成下一次 | 备注 |
| --- | --- | --- | --- |
| **完成**（勾选 done） | `done = true`，保留 | **是**（若未超 COUNT/UNTIL） | 生成的实例：新 id、`recurrenceIndex+1`、继承标题/时间/系列字段；UI 提示「已生成下一次：<日期>」 |
| **跳过这一次** | `skipped = true`，保留 | **是** | `skipped` 不进完成率分母；默认列表弱化显示（灰色 + 「已跳过」） |
| **结束整个系列** | 当前实例保留（未完成则标记 skipped） | **否**，且 `series.endedAt = now` | 未完成的未来实例一并删除；已完成的保留历史 |
| 非重复任务 | 与 v0.7 相同 | — | — |

**系列生成时机**：在 `toggleDone` / `skipRecurring` 的同一个 IndexedDB 事务里完成（任务 + series 一起写），避免"完成成功但下一次没生成"的半截状态。连续点击完成时用 `series.recurrenceIndex` 幂等去重（同一 index 不重复生成）。

---

## 5. 区间事件

- `endAt` 为 **exclusive**（与 ICS DTEND 一致），`endAt > startAt` 校验；非法值在解析/导入时丢弃并 warning。
- **冲突检测**：`scanConflicts` 增加区间重叠判定（`[a.start, a.end) ∩ [b.start, b.end) ≠ ∅` → `danger`）；点事件与区间之间也按此判断。现有「相差 <2 小时」规则保留给纯点事件。
- **月视图**：任务在 `[startDay, endDay]` 的每一天都显示圆点；当天列表给「跨天」标记；不做跨格长条（下一版再说）。
- **导出**：`DTSTART` = startAt，`DTEND` = endAt（全天用 `VALUE=DATE`，endAt 缺省则 start+1 天）。
- **导入**：多日全天 → `allDay=true, startAt=首日00:00, endAt=DTEND`；跨天定时 → `startAt/endAt`。

---

## 6. ICS 导入/导出变化

| 项 | v0.7 行为 | v0.8 行为 |
| --- | --- | --- |
| RRULE | 只取首个实例，丢弃规则 | **保留规则**（`rrule`），实例以系列形式入库；**不展开未来实例**（不生成 N 条） |
| 多日全天 | 只保留首日 + warning | `startAt` + `endAt` 完整保留 |
| 导出 | 每个任务一个 VEVENT | 系列主事件带 `RRULE` 导出一次；实例按完成状态不重复导出 |

**CHANGELOG 需写明**：v0.6 的「RRULE 只导入首个实例」升级为「保留规则、按需生成下一次」；老导入数据不自动回溯生成。

---

## 7. UI 入口（先做最小可用）

1. **CandidateCard**：开始时间存在时显示「重复」选择（不重复 / 每天 / 每周 / 每月 + 简单间隔）；选项变化实时写 `rrule`（预览仅展示下一两行说明）。
2. **TaskRow**（日程）：重复任务显示 `↻ 每周五` 徽标；完成时自动生成下一次并 toast；行内菜单「跳过这一次 / 结束系列」。
3. **月视图**：跨天事件圆点铺满区间；当天列表标「跨天」。
4. **ICS 导入预览**：重复事件不再只提示「仅首个实例」，改为「将作为重复任务导入（规则：每周五）」。
5. 手动添加表单：可选「重复」下拉（仅当填了时间）。

---

## 8. 测试计划

| 层 | 用例 |
| --- | --- |
| core 单测 | RRULE 解析/规范化（中文 → 规则）、nextOccurrence（DAILY/WEEKLY/MONTHLY、INTERVAL、BYDAY、COUNT、UNTIL）、月末 clamp、闰年、DST（`TZ=America/New_York`）、区间重叠判定、migrateTaskV2toV3 纯函数 |
| 应用单测 | 完成生成下一次的幂等（同 index 不重复）、COUNT 用完不再生成、结束系列删未来实例 |
| e2e | 每周任务：完成 → 出现下一次；跳过 → 不产生完成记录但生成下一次；编辑开始时间后下一次按新时间；月视图跨天事件圆点；ICS 导入带 RRULE → 显示重复徽标 |
| 变异 | 去掉 COUNT 判断 / 月末 clamp / DST 用 ms 推进 / 区间重叠用 `<` 而非 `<=`（边界）→ 必红 |

---

## 9. 工作量与上架建议（今天）

| 块 | 估时 | 可否今天 |
| --- | --- | --- |
| DB v3 + 迁移纯函数 + 单测 | 1h | ✅ |
| 重复规则核心（解析 + next + 单测） | 2.5h | ✅ |
| 完成/跳过/结束系列（store + 事务） | 1h | ✅ |
| ICS 导入/导出适配 | 1.5h | ✅ |
| 区间 `endAt` + 冲突检测 + 月视图 | 1.5h | ⚠️ 可延后 |
| 重复 UI（CandidateCard/TaskRow 入口） | 1.5h | ✅（最小版） |
| e2e + 文档 + 备份 | 1h | ✅ |

**建议今天先上「重复任务」全链路 + `endAt` 只做数据与 ICS 往返**；**月视图跨格与 UI 徽标细化**如果时间不够，拆到 v0.8.1（我按你说的「全部修完再发」不会省测试，只是把 UI 打磨分版）。**这条也请你定。**

---

## 10. 待确认（**请逐条回复**）

1. **系列存储选 A 还是 B？**（推荐 B：独立 `series` 表）
2. **「跳过这一次」用 `skipped` 标记（推荐）还是直接删除并生成下一次？**
3. **「结束系列」= 置 `endedAt` + 删除未完成未来实例（推荐），还是把所有实例的 rrule 清空？**
4. **MONTHLY 月末策略：clamp 到月末（1/31→2/28→3/31，推荐）还是跳过无效月（RFC 直译）？**
5. **老全天数据双形状（`dueAt` 锚点 vs 新 `startAt/endAt`）是否接受？**（推荐接受 + 辅助函数统一，避免全库改写）
6. **今天上架的范围**：只上重复任务全链路 + ICS 往返（推荐），月视图跨格/UI 细化放 v0.8.1？
