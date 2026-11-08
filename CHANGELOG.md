# 变更记录

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，格式参考
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

### 变更

- **TypeScript 5.9 → 7.0.2**（原生编译器重写）。迁移要动两处：
  - TS7 **移除了 `baseUrl`**，`paths` 必须写相对路径 → 删 `baseUrl`，
    改为 `"@/*": ["./src/*"]`、`"shisui-core": ["./packages/core/src/index.ts"]`。
  - TS7 **不再自动包含 `@types/node`**：`shisui-core` 的 `tsconfig.build.json` 只声明了 ES2022 lib，
    原先 `ics.ts` 靠环境里的 `TextEncoder` 计算折行字节数 → 改为纯数学的 `utf8Length()`，
    结果与之前完全一致，且不再依赖宿主全局对象。
- `src/styles.css` 补齐文件末尾换行。

### 测试

- 迁移后：`typecheck` 0 · 105 单测 · `build` 0 · core build（40 个产物）+ `smoke:core`（27 导出）0 ·
  Playwright 9 条全绿。评估时还确认：**只跑 `vitest` 会漏掉 TS 配置问题**（它走 esbuild，不经过 tsc）。

（下一个版本的计划见 [docs/ROADMAP.md](docs/ROADMAP.md)）

## [0.5.0] - 2026-11-07

**与真实日程打通：导出 ICS；装到桌面：PWA。**

### 新增

- **ICS 导出**（日程页「导出 .ics」）：把当前待办导出成 `.ics`，可导入系统日历 / Google Calendar。
  - 时间一律转成 **UTC**（`...Z`），不写 `TZID` + `VTIMEZONE` —— 各客户端对时区名支持不一致，UTC 最稳
  - **本地时间恰好 00:00** 的任务按**全天事件**导出（`VALUE=DATE`），其余按带时刻事件
  - 只有截止时间的任务默认排 30 分钟；有开始+截止时用两者之差
  - TEXT 转义（反斜杠 / 分号 / 逗号 / 换行）与 **按 75 字节折行**（中文一个字 3 字节，按字符折会超长）
  - 纯函数 `tasksToIcs()` 在 `shisui-core`，零运行时依赖，11 条单测覆盖
- **PWA**：`manifest.webmanifest` + 手写 Service Worker（不引入 `vite-plugin-pwa`）
  - 可安装、**离线能打开**：导航请求 network-first、失败回退缓存的应用外壳；静态资源 cache-first
  - **只处理同源 GET**，跨域请求一律放行 → 「默认零网络请求」的承诺不受影响
  - **更新不自动接管**：新版本装好先提示，用户点「刷新」才 `skipWaiting` + reload（避免操作中途换页丢输入）
  - **不缓存业务数据**：缓存里只有应用外壳与静态资源；待办本来就在 IndexedDB
  - 开发环境不注册 SW（避免干扰 HMR）

### 变更

- **补充 AGPL §13 源码入口**：页脚与「关于」页都链到
  [github.com/dream-office/shisui](https://github.com/dream-office/shisui)，
  并附 LICENSE。AGPL 第 13 条要求：通过网络使用本应用的，有权获取对应源码。
  页脚链接由 E2E 断言守护（删掉即红）。
- 版本 0.4.0 → **0.5.0**；`shisui-core` → **0.4.0**（新增 `tasksToIcs` / `isAllDayTimestamp` / `escapeIcsText`）。
- Playwright 的 `webServer` 改为「先 build 再 preview」：PWA 只在生产构建注册，dev server 测不了离线。
- **图标改为 PNG**（192 / 512 / maskable 512 / apple-touch-icon 180）：iOS 不认 SVG 形式的
  `apple-touch-icon`，只给 SVG 会导致 iOS 添加到主屏时没有图标。SVG 保留作为 `sizes: any` 的补充。
- Service Worker 的缓存写入包进 `event.waitUntil()`：否则 Worker 可能在写缓存前被浏览器终止，
  表现为「偶尔离线打不开」。`put()` 现在返回 Promise，便于等待。

### 测试

- 单元测试 94 → **105**（ICS 11 条：UTC 转换 / 全天判定 / 转义 / 折行 / 排序 / 跳过规则）。
- 端到端 6 → **9** 条：新增 G ICS 下载（校验文件内容与转义）、H 离线可打开、I manifest 可访问。

## [0.4.0] - 2026-11-07

**手动添加待办 + 导入历史：从「只能解析」变成「也能自己写」。**

### 新增

- **手动添加待办**：不经过解析引擎，直接写标题 / 截止时间 / 类型 / 渠道 / 地点。
  用于口头通知、临时安排，或「解析结果想自己修一条」。构造与校验是 core 的纯函数
  `createManualTask()`（带单测），所以规则和界面分离。
- **导入历史**：每次「全部收录」都会留下原始通知文本，可在收件页回看与「重新解析」
  （同一份通知过一阵又要交一次时很有用）。数据本来就在 IndexedDB 的 `batches` 表里，这次只是把它显示出来。
- **设置页「关于」显示版本与许可**：版本号直接读 `package.json`，避免文档与实际脱节；
  并给出第三方许可声明入口。
- **Dependabot 配置**（`.github/dependabot.yml`）：npm 依赖每周一查、补丁/次版本合成一个 PR、
  GitHub Actions 每月查。

### 变更

- 领域类型 `ParsedTask.engine` 增加 `'manual'`：手动添加的条目不该伪装成「规则引擎解析出来的」。
- `shisui-core` 同步升到 **0.3.1**（新增 `createManualTask` 导出；纯函数，零运行时依赖）。

### 测试

- 单元测试 89 → **94**（新增 manual 构造与校验 5 条）。
- 端到端从 4 → **6** 条：手动添加 → 日程可见、收录 → 历史有记录；两条都用变异验证过「能红」。

## [0.3.2] - 2026-11-07

**公开材料里不再出现个人邮箱；反馈与安全报告统一走 GitHub。**

### 变更

- 移除 `SECURITY.md`、`package.json` 的 `author` 以及本文件里的邮箱地址。
  安全报告改用 GitHub **Security → Report a vulnerability**（私密渠道）；一般反馈走仓库 Issues。
- **重写 git 历史**：所有提交的作者/提交者邮箱统一为 `dream-office@users.noreply.github.com`
  （范围含 `main`、`gh-pages` 与全部 tag）。因此**旧提交哈希全部变化**，
  旧 tag 到新 SHA 的映射随 Release 说明提供。
- 本地提交身份同步改为 noreply，避免以后再写进历史。

> 本版不改任何产品行为，只改文档与仓库元数据。功能与 0.3.1 完全一致。

## [0.3.1] - 2026-11-07

**发布质量与门面补齐：可复用的说明文档、真浏览器冒烟测试、依赖升级。**

### 新增

- `SECURITY.md`：安全漏洞的私密报告渠道（邮件 + GitHub Security）、48 小时确认承诺、支持范围，
  并写清哪些是「设计行为」而不是漏洞（清空浏览器=数据删除、启用 AI 后内容会发给服务商）。
- `public/licenses/THIRD_PARTY_NOTICES.md`：第三方依赖与许可声明。Dexie 为 **Apache-2.0**（含 NOTICE），
  React / React DOM / Zustand 为 MIT；许可原文一并放进产物，可通过 `/licenses/` 访问。
- **Playwright 冒烟测试**（`e2e/smoke.spec.ts`）覆盖四条用户最先遇到的路径：首屏无 console error、
  示例数据→解析→收录→日程、设置页文案、**默认零跨域请求**。
- `package.json` 补 `author`（`dream-office`）。

### 变更

- 版本 0.3.0 → **0.3.1**；README / CHANGELOG / 版权主体统一为 `dream-office`。
- CI 增加「核心包构建 → 核心包冒烟（Node ESM 可 import）」两步，防止发布产物不可用这类回归（`pnpm smoke:core`）。
- 依赖：`vitest` 3.2.7 → **4.1.12**（合并依赖机器人 PR #1，2 个 critical 告警）；新增 `@playwright/test` 开发依赖。

### 修复

- **设置页「关于拾穗」的隐私表述过于绝对**：原来写「学号、客户名、手机号、合同金额不会离开你的浏览器」，
  但启用 AI 引擎后粘贴的内容会发给你填写的服务商。改为「默认不联网……只有你主动启用 AI 引擎时，
  粘贴的内容才会发给你自己填写的服务商」，与 README 口径一致。
- **贡献许可表述与混合许可不符**：`CONTRIBUTING.md` 原写「按本仓库的许可证（AGPL-3.0-or-later）授权」，
  但 `packages/core/` 是 MIT。改为按「所修改部分所在的许可证」授权（应用 AGPL / 核心 MIT），
  并去掉容易被误读为 CLA 的「保留调整许可余地」说法。

## [0.3.0] - 2026-11-06

**把解析核心拆成独立包 `shisui-core`，单独以 MIT 授权。**

### 新增

- `packages/core/`：时间归一化、通知解析、冲突体检、格式渲染、双引擎合并、示例样本，
  从 `src/core/` 整体迁入（`git mv`，保留文件历史）。包自带 `package.json` / `LICENSE`(MIT) / `README.md`，
  可独立 `pnpm --filter shisui-core build` 产出 `dist/` + `.d.ts`。
- 应用层改为 `import … from 'shisui-core'`，workspace 依赖（`workspace:*`），开发时直接吃源码，改完立刻生效。

### 变更

- **许可拆分**：应用本体保持 AGPL-3.0-or-later，`packages/core/` 改为 MIT。
  解析能力是通用基础设施，不该被 copyleft 绑住；应用是完整产品，AGPL 依然合理。
- 新增 devDependency `@types/node`（`vite.config.ts` 用 `node:url` 定位核心包源码）。
- 测试配置改为同时发现 `src/**/*.test.ts` 与 `packages/**/*.test.ts`。

### 验证

- `tsc --noEmit` 干净；全部单元测试通过（时间 / 解析 / 冲突三组）；`vite build` 通过；
  `pnpm --filter shisui-core build` 能产出 `dist/`（含 `.d.ts` 与 sourcemap）。
- 干净环境验证：`git archive HEAD` 到空目录 → `pnpm install --frozen-lockfile` → 类型检查 / 测试 / 构建全过。

## [0.2.1] - 2026-11-05

发布前复核（独立子代理）逐条审出来的问题，全部修掉。

### 修复

- **标题被裁空**：原来按「日期起点 → 钟点终点」整段删除，日期和钟点隔得远时会把中间正文一起吃掉
  （`请于11月18日之前把预算表发到财务邮箱，并在下午3点前确认` → 标题只剩「于确认」）。
  改为按日期、钟点各自区间裁剪，并吃掉紧邻的「请于 / 在 / 前 / 之前」虚词。
- **取消类通知漏判**：收紧负面词时丢掉了裸「取消」与「已截止」，
  「本周五的班会取消」会生成一条假待办。已补回，并单独加测试（不含「不再受理」这种催交措辞）。
- 「图书馆报告厅」只截成「图书馆」；会议号 `123-456-789` 里的 `23-456` 被当成房间号。
- 过期提示「联系老师」改为「联系通知发起人」——公司群用户看到「老师」会出戏。
- 文档与界面里的测试数从 48 统一改为不写死数字，避免和实际条数脱节。

### 测试

- 测试数从 53 增加到 89（当时的数字，仅供还原当轮规模）：新增标题完整性（含「日期钟点相距很远」「时段词」「关于」「截至」「定于」「（周三）」「前台/前往」等多组完整标题断言）、取消类通知、默认时刻（事件 09:00 / 截止 23:59）、
  审批类型、钉钉 / 企业微信 / 在线文档 / 线上会议渠道、辅导员样本（图书馆报告厅 + 会议号）、
  三个示例样本的标题整体回归（禁止残留「上午/下午/中午/晚上」）。
- `SAMPLE_NOTICE_2` 从死代码接入测试。
- `scripts/privacy-scan.py` 新增（发布前隐私自查），`scripts/check-encoding.py` 发现问题时改为非零退出。
- 本机 `node_modules` 在项目改名后指向已删除路径，已重装并重跑全部检查。

## [0.2.0] - 2026-11-05

### 变更

- **项目改名**：课代表 → **拾穗 / shisui**。取米勒《拾穗者》之意——收割后落在地上的麦穗，
  只有肯弯腰的人才不会踩过去；群里那句「周五 18:00 前交」也是一样。
- **定位通用化**：不再只面向校园。事项类型重做为 任务 / 会议 / 评审 / 报名 / 报销缴费 / 审批 / 问卷 / 考试；
  提交渠道新增飞书、企业微信、OA、Jira、在线文档；地点支持 `3楼会议室` 这类写法。
- 新增工作群样本与对应测试，单测 48 → 53。这组测试是通用性的守门人：以后只改校园写法会先红。
- 本地数据库名与 localStorage 前缀改为 `shisui`。**升级即重置**：v0.1 的本地数据不会迁移
  （当时只有开发期测试数据，写迁移代码不值得）。

### 修复

- 「逾期本季度不再受理」被误判为「整条通知作废」，一条真待办被静默丢弃。
  负面词收紧为「已取消 / 已结束 / 不再举行 / 作废」。
- 「链接在飞书文档」中的「文档」把问卷误判成交付任务——`task` 规则移除了过泛的「文档」。
- 时间短语被裁掉后标题残留编号（`1.`）、截止词（`前`）与中文之间的空格。

## [0.1.0] - 2026-11-04

首个可用版本：粘贴通知 → 解析待办 → 收录进日程 → 冲突体检，完整闭环。

### 新增

- **中文时间归一化引擎**（`core/time.ts`）：绝对日期、月日、`本周X` / `下周X` / `下下周X`、
  相对日（今 / 明 / 后 / 大后天）、时段折算（下午 +12h）、`N天内`、中文数字（`十八` / `三十一`）。
  纯函数，`ref` 注入，48 条单测确定性通过。
- **通知切分与待办抽取**（`core/ruleParser.ts`）：按换行 / 句号 / 编号三级切分，
  识别事项类型、提交渠道、地点，时间短语从标题中剔除，输出可解释理由与 `high/medium/low` 置信度。
- **冲突体检**（`core/conflict.ts`）：已过期、2 小时内撞车、同一天堆积 3 件以上、未来 7 天压力分布。
- **AI 增强引擎**（`services/llm.ts`）：任意 OpenAI 兼容接口，`temperature: 0`，流式 SSE，
  未配置密钥时静默降级；与规则引擎结果保守合并（AI 独有条目置信度封顶 `medium`）。
- **本地优先存储**（`data/`）：Dexie / IndexedDB，仓储层隔离，支持整库导出与导入 JSON。
- **三视图界面**：收件（粘贴即解析、候选卡片就地编辑）、日程（按天分组 + 倒计时 + 冲突告警）、
  设置（AI 配置、数据管理）。样式手写，无 UI 框架。
- **工程化**：TypeScript `strict`、vitest（threads 池）、GitHub Actions CI（类型检查 / 测试 / 构建 / 编码自查）、
  GitHub Pages 部署工作流、AGPL-3.0 许可证。

### 已知限制

- 一句话里塞多件事会合并成一条，需人工拆。
- 只接受文本粘贴，不支持图片 OCR。
- 不做系统通知推送。
