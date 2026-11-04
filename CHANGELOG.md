# 变更记录

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)，格式参考
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [Unreleased]

（下一个版本的计划见 [docs/ROADMAP.md](docs/ROADMAP.md)）

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
