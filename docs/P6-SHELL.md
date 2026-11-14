# shisui P6 双外壳（v2.0 架构，v2.2 实测）

> P6 架构来自 v2.0；体积/测试为 v2.2 当前值（2026-11-14）
> 同一代码库，两个构建目标；核心/数据/组件共享。

## 1. 构建命令与产物

| 目标 | 命令 | 产物 | PWA |
|---|---|---|---|
| standalone | `pnpm build:standalone` / `pnpm build` | `dist/` | manifest + `sw.js` |
| embedded | `pnpm build:embedded` | `dist/embedded/` | 无 manifest / 无 sw |

实测（v2.2.1 底栏后重测，2026-11-14；gzip = Python `gzip.compress` 默认，raw 不含 sourcemap）：

| | standalone | embedded |
|---|---:|---:|
| 主 JS raw | 487,683 B | 480,373 B |
| 主 JS gzip | 161,302 B | 158,850 B |
| CSS raw/gzip | 63,137 / 12,869 B | 63,137 / 12,869 B |
| manifest / sw | ✅ / ✅ | ❌ / ❌ |

embedded 比 standalone 少约 **7.3 KB raw / 2.5 KB gzip**（PWA、壳/页脚、设置部分被裁）。

## 2. embedded 裁掉了什么

- PWA manifest / `sw.js` / 安装引导 / theme-color meta / apple meta
- 桌面侧栏、移动顶条 + dock、页脚隐私声明
- 设置内“外观（主题三态）/ 界面语言”
- `registerServiceWorker` 调用、manifest 切换、主题持久化写入
- 不写 `<html lang>` / `document.title`（宿主负责）

保留：收件/日程/月历/统计、数据导出/清空/备份恢复、图片识别、AI 接入、帮助、关于。

## 3. 设置归属矩阵

| 设置 | standalone | embedded | 持久化 |
|---|---|---|---|
| 主题亮/暗/跟随 | ✅ | ❌（宿主 `html[data-theme]`） | 宿主 |
| 界面语言 | ✅ | ❌（宿主 `html[lang]` 初始化） | 宿主 |
| 隐私声明 | ✅ 页脚 | ❌（网站隐私页） | — |
| 数据导出/清空/备份 | ✅ | ✅ | 本地 |
| 图片识别 / AI | ✅ | ✅ | 本地 |
| 帮助 / 关于 | ✅ | ✅ | — |
| PWA 安装 | ✅ | ❌ | — |

## 4. 路由挂载

- 固定前缀 `/projects/shisui`，入口 `/projects/shisui/{inbox|plan|calendar|stats|settings}`。
- `viewFromPath()` 初始化视图；`navigate()` 用 `pushState` 更新子路径；`popstate` 用路径回退。
- 深层链接/刷新：`embedded-v2.spec.ts` 实测 `/plan` ×2、`/settings`。
- 宿主需把 `dist/embedded` 挂到该前缀并做 SPA fallback；资源用绝对前缀 `/projects/shisui/assets/...`。
- 登录态由宿主保护该路由；app 只读，不存 token。

## 5. 样式隔离（当前边界）

- embedded 下 `html[data-shell="embedded"] body` 透明、继承宿主字体/颜色；app 外壳 `.shell.is-embedded` 自己设背景/字体/隔离。
- app 不渲染导航/页脚；主内容 `max-width:1080`，320/390 无横向溢出。
- **未上 Shadow DOM**：CSS 仍通过 link 加载，token 定义在 `:root`；若宿主也使用 `--bg/--surface` 等同名 token，可能互相覆盖。接站时建议宿主用命名空间变量或后续切 Shadow DOM。

## 6. 测试

`413 × 2` 单测 + `130` e2e（+embedded E1/E2）。
