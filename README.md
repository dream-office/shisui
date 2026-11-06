# 拾穗 · shisui

[![ci](https://github.com/dream-office/shisui/actions/workflows/ci.yml/badge.svg)](https://github.com/dream-office/shisui/actions/workflows/ci.yml)
[![license: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

> 群里散落的截止时间，替你捡起来。

纯前端 · 本地优先 · 无需账号 · 无后端 · [AGPL-3.0](LICENSE)

> **English** — Paste a wall of Chinese chat messages — project group, department group, class group,
> family group — and get a clean to-do list with absolute timestamps plus an automatic clash check.
> Runs entirely in the browser: no account, no server, no data leaves your device.

---

## 为什么叫「拾穗」

米勒的画里，收割后的麦田落了一地麦穗，只有肯弯腰的人才不会把它踩过去。

群聊就是那片麦田。真正要命的信息往往是一句「@所有人 周五 18:00 前交」，
淹在两百条闲聊里；说话的人以为大家都看见了，看见的人以为是别人在负责。

拾穗不读你的聊天记录（它没这个权限，也不想要）。你只需要把那句话粘进来。

## 它解决什么

工作群：

```
【项目群】张经理：
1. 本周五18:00前把 Q4 预算表发到财务邮箱，抄送王总。
2. 下周一上午10点在 3楼会议室 开项目复盘会。
3. 报销单请在11月20日前提交到 OA，逾期本季度不再受理。
```

学校群：

```
【教务处】1. 本周五23:59前在学习通提交实验报告三，逾期系统自动关闭。
```

读起来都是人话，落进日历却全是模糊的。拾穗把它们变成带绝对时间的待办，
并当场告诉你：哪两件事几乎同时截止、哪一天堆了三件。

## 功能

- **中文口语时间归一化**：`本周五23:59`、`下周三之前`、`明晚8点`、`中午12点前`、`3天内`、`11月18日`、`八点半`、`下下周一`、`2026-11-18` 全部换算成绝对时刻。
- **事项结构化**：识别类型（任务 / 会议 / 评审 / 报名 / 报销缴费 / 审批 / 问卷 / 考试）、提交渠道（飞书 / 钉钉 / 企业微信 / OA / Jira / 邮箱 / 学习通 / 纸质…）、地点（`3楼会议室`、`教学楼A301`），并把时间短语从标题里剔掉。
- **可解释的置信度**：每条都给 `high / medium / low` 和判断理由，歧义表达（光说「8点」、已过去的日期）会被标出来，**逼你确认，绝不静默猜错**。
- **冲突体检**：已过期、两件相差不到 2 小时、同一天堆 3 件以上、未来 7 天压力分布。
- **双引擎**：规则引擎可离线、可解释；接上任意 OpenAI 兼容接口后叠加 AI 增强。**不配 API Key 也完整可用**。
- **本地优先**：数据只存在浏览器 IndexedDB，可导出 / 导入 JSON 整库备份。

## 快速开始

| 项目 | 要求 |
| --- | --- |
| Node.js | ≥ 22.13（pnpm 11 依赖 `node:sqlite`；开发使用 24.x） |
| 包管理器 | pnpm 11（`packageManager` 已锁定）；npm 亦可 |
| 浏览器 | 需要 IndexedDB 的现代浏览器 |

```bash
pnpm install     # 安装依赖
pnpm dev         # http://127.0.0.1:5173
```

首次打开点「工作群示例」或「学校通知示例」→「开始解析」，2 分钟内能看完整个闭环。

> 用 npm：`npm install && npm run dev`。本仓库锁文件为 `pnpm-lock.yaml`。

### 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 开发服务器（含 HMR） |
| `pnpm build` | 生产构建 → `dist/` |
| `pnpm preview` | 预览构建产物 |
| `pnpm test` | 单元测试（确定性，注入固定 ref） |
| `pnpm test:watch` | 测试监听模式 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm check` | typecheck + test |

### 在线 Demo

**https://dream-office.github.io/shisui/**

纯前端、无后端，页面加载完就能用（数据仍只存在你自己浏览器里）。
发布方式是把构建产物推到 `gh-pages` 分支，由 GitHub Pages 直接托管——不依赖 CI：

```bash
pnpm deploy:pages     # 构建并发布到 gh-pages
```

细节与切换到 GitHub Actions 的方法见 [docs/DEPLOY.md](docs/DEPLOY.md)。

<!-- 截图放这里（截好后删掉本行注释）：
![收件页](docs/images/inbox.png)
![日程页](docs/images/plan.png)
-->

## 工作原理

### 分层

```
packages/core/        ← 独立包 shisui-core（MIT）：纯领域逻辑，零 React、零 IO
├─ time.ts               中文时间表达归一化
├─ ruleParser.ts         通知切分与待办抽取
├─ conflict.ts           冲突体检与压力分布
├─ merge.ts              规则 + AI 双引擎合并
└─ format.ts             时间渲染与倒计时

src/                  ← 应用本体（AGPL-3.0-or-later）
├─ data/        持久化：Dexie schema 与仓储层
├─ services/    外部 IO：AI 引擎（Prompt / 流式 SSE / 降级）
├─ state/       状态编排：解析 → 合并 → 确认 → 落库
└─ ui/          视图组件：只读状态、调 action
```

依赖方向严格单向：`ui → state → data / services → shisui-core`。核心包不 import 任何上层模块，
所以能被单测完整覆盖；`ui` 不含业务分支，所以改视觉不动逻辑。

**核心包为什么单独拆出来**：解析能力是通用基础设施，不该被 AGPL 绑住。
它有自己的 `package.json` / `LICENSE`(MIT) / `README`，能单独 build，也能被别的项目直接引用。

### 时间归一化：注入 `ref` 的纯函数

```ts
import { extractTime } from 'shisui-core'

extractTime('本周五23:59前提交实验报告', new Date(2026, 10, 4, 22, 7))
// → { atMs: 2026-11-06 23:59, isDeadline: true, ambiguous: false, ... }
```

「现在」是**参数**而不是 `Date.now()`，所以任何时刻调用都得到同一结果——全部测试确定性通过，
换机器、换时区、明年再跑结果不变。这是本项目最重要的一条设计约束。

`ambiguous` 标记的三种典型情况：只有钟点没有时段（「8点」到底是上午还是晚上）、
已过去的月日（按明年算）、只有钟点没有日期（推到最近一次未过期时刻）。

### 双引擎合并

```
通知原文 ─┬─→ 规则引擎（可解释、离线、快） ──┐
          └─→ AI 引擎（覆盖刁钻写法、慢）  ──┴→ mergeTasks() → 候选卡片
```

合并策略刻意保守：规则引擎命中的时间优先保留；两引擎对上的条目置信度取高者；
**AI 独有的条目置信度封顶 `medium`** 并提示重点核对——无法解释的结论不配高置信。
AI 请求固定 `temperature: 0`，流式读取，把「正在读 / 已收 N 字」直接显示在界面上。

### 冲突体检

| 检查 | 触发条件 | 展示 |
| --- | --- | --- |
| 已过期 | 截止时间早于现在 | 红色行 + 独立告警 |
| 撞车 | 两条截止相差 ≤ 2 小时 | 黄色告警 |
| 堆积 | 同一天 ≥ 3 件 | 黄色告警 |
| 压力 | 未来 7 天每天件数 | 柱状压力条 |

## 数据与隐私

- 没有后端，**默认不发任何网络请求**。配置 AI 引擎后，请求直接发给你填的服务商，密钥只存本机 `localStorage`。
- 数据存在浏览器 IndexedDB，清浏览器数据即彻底删除；设置页可导出 / 导入 JSON 备份。
- 群消息里常有学号、手机号、客户名、金额，这个设计不是省事，是必需。

## 已知限制

1. **跨天边界**：「本周日」在周日当天解析为当天，不自动顺延到下周（会标歧义）。
2. **多事项复合句**：一句话塞三件事（「交报告、报名、开会」）目前合并成一条，需人工拆。
3. **只接受文本**：暂不支持图片通知 OCR。
4. **无推送提醒**：当前是「打开就看到」，不做系统通知。
5. **AI 引擎依赖外部服务**：不可用时自动降级到规则引擎并提示。

### 时间写法上的缺口（会标低置信度或提示核对）

| 写法 | 目前行为 | 建议 |
| --- | --- | --- |
| `本月30号`、`下月初`、`月底前` | 识别不出日期，`dueAt` 为 null | 手动补时间 |
| `3个工作日内` | 只认「N 天内」，工作日不跳过周末 | 手动核对 |
| 只写 `20日`、`20号`（不带月份） | 只认到「几点」，日期按「明天」估 | **务必核对日期**，这是最容易静默排错的一类 |
| `11月18日前后` | 「前后」不是截止词，日期能认出但不带时间 | 手动确认 |
| 会议 / 考试 / 评审没写钟点 | 默认按 09:00 排，并作为开始时刻 | 在候选卡片上直接改 |
| 任意类型，但句子里有「前 / 截止」 | 一律按截止处理，默认 23:59（哪怕类型是评审） | 同上 |

这些缺口都是**宁可标低置信度、也不猜**的处理方式。规则的优先级是：不编造，而不是看起来聪明。

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。改动 `packages/core/` 请务必带测试——那里的每条规则都对应一类真实通知写法。

- [路线图](docs/ROADMAP.md) —— 想做什么、明确不做什么
- [设计记录](docs/DEVLOG.md) —— 关键决策与踩过的坑
- [变更记录](CHANGELOG.md)

## 许可证

本项目**分两块授权**：

| 部分 | 目录 | 许可 |
| --- | --- | --- |
| 应用本体 | `src/`、`index.html`、`scripts/` | [AGPL-3.0-or-later](LICENSE) |
| 解析核心 | `packages/core/` | [MIT](packages/core/LICENSE) |

**为什么核心用 MIT**：中文时间解析、通知切分、冲突体检是通用能力，不该被 copyleft 绑住。
应用是完整产品，保持 AGPL 合理。

应用的许可（AGPL）简单说：你可以自由使用、修改、分发本项目，包括商用；
但如果你修改后把它部署成**供他人通过网络访问的服务**，你也必须把修改后的源码以同样的许可证公开。

```
Copyright (C) 2026 shisui contributors

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```

> 把上方版权署名里的 `shisui contributors` 换成你希望署名的名字或组织即可。
