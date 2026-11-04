# 贡献指南

感谢你有兴趣改进课代表。这是一个小而专注的工具，欢迎**修 bug、补时间表达式、加测试**，
但对「加一个大功能」比较谨慎——先开 Issue 聊聊，比直接提一个大 PR 更省双方时间。

## 开始之前

- 小改动（错别字、样式微调、新的时间表达写法 + 测试）可以直接提 PR。
- 大改动（新视图、新数据模型、引入依赖、改变分层）请先开 Issue，说明动机与方案。
- 提之前请跑一遍 `pnpm check`（类型检查 + 全部单测）。

## 开发环境

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
pnpm test       # 48 条单测
```

Node ≥ 18，pnpm ≥ 9。仓库使用 `pnpm-workspace.yaml` 放开 esbuild 的安装脚本（pnpm 11 默认拦截），
如果你换用 pnpm 的其他版本遇到 `ERR_PNPM_IGNORED_BUILDS`，先看 [docs/DEVLOG.md](docs/DEVLOG.md) 的踩坑记录。

## 代码结构约定（硬性）

依赖方向严格单向，不允许反向 import：

```
ui → state → data / services → core
```

| 层 | 允许做的事 | 禁止做的事 |
| --- | --- | --- |
| `core/` | 纯函数、纯类型 | import React / Dexie / `fetch` / `localStorage` |
| `data/` | 读写 IndexedDB | 业务判断、UI 文案 |
| `services/` | 网络请求、外部协议 | 直接改 React 状态 |
| `state/` | 编排业务流 | 写 JSX |
| `ui/` | 渲染、交互 | 业务阈值（如「12 小时内算紧急」） |

第二条硬性规则：**业务阈值只允许存在一处**。倒计时颜色阈值在 `core/format.ts` 的 `countdown()`，
组件只消费返回的 `tone`。同理，某个数字出现在两个地方就是 bug 的开始。

## 编码风格

- TypeScript `strict`，不要用 `any` 逃逸，也不要靠 `as` 压掉类型冲突（类型问题会在运行时以更贵的方式回来）。
- 不引入 UI 框架。样式写在 `src/styles.css`，用现有 CSS 变量。
- 注释解释**为什么**，不解释**是什么**。
- 文件顶部用一段注释说明这个模块解决什么问题。

## 测试要求

改 `core/` 必须带测试，这不是形式主义：

- **时间相关一律注入 `ref`**，不要用 `Date.now()`，否则测试会随时间漂移。
- 断言具体字段（类型、渠道、地点、绝对时间、置信度），不要只断言「长度是 4」。
- 新增时间表达写法时，在 `src/core/samples.ts` 里加一条真实通知样本，并让 UI 示例与测试共用同一份。

## 提交信息

用 [Conventional Commits](https://www.conventionalcommits.org/) 前缀，中文描述完全没问题：

```
feat(core): 支持「下个月初」这类模糊月份表达
fix(ui): 修复窄屏下倒计时徽章换行
docs: 补充 Pages 部署说明
chore: 升级 vitest
```

一次提交做一件事。不要把「新功能 + 顺手重构 + 改格式」混在一个 commit 里。

## Pull Request 检查清单

- [ ] `pnpm check` 通过
- [ ] 新增/修改的 `core/` 逻辑有对应测试
- [ ] 没有引入 UI 框架或重量级依赖（新依赖请在 PR 描述里说明理由与体积影响）
- [ ] 没有把业务判断写进组件
- [ ] 涉及数据结构的改动说明是否做了 Dexie 版本迁移
- [ ] 界面改动附截图（移动端也要看一眼）

## 分支与发布

- `main` 保持随时可构建、可测试。
- 功能开发走 `feat/xxx`、`fix/xxx` 分支，PR 合入 `main`。
- 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)，发布时更新 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

本项目以 [AGPL-3.0-or-later](LICENSE) 发布。提交 PR 即表示你同意你的贡献以同一许可证分发，
无需签署额外协议。请只提交你有权提交的代码。
