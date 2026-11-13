# shisui v2.0 · P5 暗色收口

> 2026-11-13 · 分支 `feat/v2.0-ui`
> 结论：暗色六屏、玻璃、PWA、持久化通过；无亮底残留。

## 1. 六屏清单（含有数据态）

| 屏 | 状态 | 证据 |
|---|---|---|
| 收件 | 解析后候选 4 条 | `inbox-dark-{1280,390,360,320}.png` |
| 日程 | 待办/冲突/逾期 | `plan-dark-*.png` |
| 月历 | 有事件月份/今天选中 | `calendar-dark-*.png` |
| 统计 | 有指标/趋势/分布 | `stats-dark-*.png` |
| 设置 | 外观/语言/备份/AI | `settings-dark-*.png` |
| 弹窗 | 使用说明（玻璃） | `modal-dark-*.png` |

## 2. 暗色对比度（实测）

| 对 | 比值 |
|---|---:|
| t-1 / bg | 17.78 |
| t-2 / bg | 9.06 |
| t-3 / bg | 5.77 |
| on-accent / btn-from | 4.70 |
| accent-ink / bg | 12.64 |
| accent / bg | 9.33 |
| success-ink / surface | 9.26 |
| warn-ink / surface | 9.37 |
| danger / surface | 5.76 |
| sidebar-fg / sidebar-bg | 8.89 |
| sidebar-active-fg / chip | 9.33 |

## 3. 玻璃 / 亮底

- 玻璃：输入卡、弹窗、移动 dock、顶条；侧栏/列表/空错卡实心。
- 暗色所有可见大面积面扫描：无亮度 >0.8 的实心底（`LIGHT []`）。
- 弹窗内无白块；暗色 textarea/input 用 `--surface-2`。

## 4. PWA / 主题

- `theme-color`：亮 `#FAF5EC` / 暗 `#1E1A12`。
- 首屏前内联脚本同步 `data-theme` 与 `color-scheme`，避免暗色系统先闪亮底。
- 跟随系统 / 固定亮暗持久化（localStorage）。

## 5. 截图

`.tmp/v2-p5/`：暗色六屏 × 1280/390/360/320，共 24 张；reduced-motion 下截图。

## 6. 测试

`412 × 2` 单测 + `113` e2e（含 P5 暗色壳/PWA/无亮底/玻璃）。
