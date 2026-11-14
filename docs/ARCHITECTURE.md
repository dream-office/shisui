# 架构说明（v1.0）

> 目标：**零后端、本地优先**。全部解析/存储在浏览器完成；唯一可能出网的是用户自己配置的 AI 接口。
>
> 当前版本：**app 2.2.0 / core 1.4.0**（DB v5；备份 schema 5）。

## 分层

```
src/
  App.tsx            应用外壳（导航、页脚、使用说明、语言同步）
  ui/                纯展示组件（Inbox/Plan/Month/Stats/Settings/Focus/Help…）
  state/store.ts     zustand 状态编排：解析→确认→落库、批量、撤销、专注、语言
  data/db.ts         Dexie（IndexedDB v4；url/note 字段）
  data/repo.ts       数据访问（事务、系列编辑、备份 replace、撤销写回）
  services/          PWA、下载、LLM 调用（可选）、文档导入（PDF/DOCX）、本地 OCR、图片识图
  i18n/              自建 i18n（字典、Intl 时间格式、t()）
packages/core/       MIT 纯函数层（解析/时间/重复/ICS/备份/冲突/统计）
```

## 关键约定

- **core 不依赖 DOM / IO**：可在 node 与浏览器复用；展示层文案不进 core（冲突提示等核心生成的字符串保留中文，v1.x 再抽）
- **DB 无隐式迁移**：schema 变更必须升 version 并写迁移；v1.0 冻结 [DATA-FORMAT.md](DATA-FORMAT.md)，v1.2 起 DB v4（url/note），core 同步 1.1.0
- **隐私**：无账号、无上传；AI Key 只存 localStorage，备份不含 Key
- **错误边界**：渲染异常不白屏；提供重试/回首页
- **无障碍**：帮助弹层 `role=dialog` + `aria-modal`，Esc 关闭、焦点回按钮；按钮/输入都有可读标签

## v1.0 增补

- **i18n**：`src/i18n/index.ts`，key=中文原文，`en` 字典映射，缺 key 回退中文；
  `setLang` 同步 `<html lang>`；日期/相对时间走 `Intl`；用户内容不翻译
- **语言持久化**：zustand `lang` + localStorage `shisui-lang`；App 挂载同步模块与 `document.title`
- **使用说明**：`HelpPanel`（三步 + 补充：本地存储/重复语义/iOS 粘贴）；
  首次访问提示条 localStorage `shisui-help-banner-seen` 只弹一次
- **测试**：i18n 字典完整性/回退/切换单测；e2e H1/H2（提示条、弹层交互）、L1（切换/刷新保持）

## 开发命令

```powershell
pnpm vitest run          # 单测（core + 应用层）
pnpm test:e2e            # Playwright（本地需 PLAYWRIGHT_CHANNEL=msedge）
pnpm build               # tsc -b + vite build
pnpm --filter shisui-core build
pnpm smoke:core
```
