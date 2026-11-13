# shisui v2.0 · P4 颜色收口

> 2026-11-13 · 分支 `feat/v2.0-ui`
> 结论：**产品 CSS 无残留 hex/rgba**；只保留签名、PWA meta、Canvas 导出固定色板、控制台色。

## 1. hex/rgba 残余清单

| 位置 | 值 | 处理 |
|---|---|---|
| `src/styles.css` 签名 mark / sprig | `#5b57f0` ×2 | **保留**，签名色不随主题 |
| `src/App.tsx` theme-color meta | `#1E1A12` / `#FAF5EC` | 保留，PWA meta 必须是 hex |
| `src/App.tsx` 控制台签名 | `#906F17` | 保留，仅 dev console |
| `src/lumen-tokens.css` | `--on-accent:#ffffff` | Lumen token 定义 |
| `src/services/statsExport.ts` | 旧 12 处 hex | **已收口**到 `CHART_PALETTE` 单一模块 |
| `index.html` / manifest | `#FAF5EC` | PWA theme/background，保留 |
| `docs/components-v2.html` | 示例色值 | 非产品入口、不参与构建 |

产品 `src/styles.css` 无 `rgba()`；其他颜色均为 `var(--token)` 或项目 token 定义（`--sidebar-*`、`--toast-*`、`--glass-*`）。

## 2. 图表 / 导出同色板

`src/services/chartPalette.ts`：

| 用途 | 值 |
|---|---|
| 纸张 | `#FCFBFA` |
| 正文 | `#1F1D1A` |
| 次文 | `#6E6A61` / `#7D786D` |
| 分隔 | `#E8E4DA` |
| 金（chart-1） | `#B89541` |
| 绿（chart-2） | `#137738` |
| 琥珀（chart-3） | `#8A5F18` |

- 与亮色页面 `--chart-1/2/3` 一致（`color-v2` e2e 实测）。
- 暗色页面用暗色变体；导出固定浅色纸张，不回旧紫。

## 3. 导出实测（真实打开）

- PNG 2400×3200：纸张 6,266,920 px、正文 45,204、金 69,120、绿 276,480、**紫 0**
- CSV：UTF-8 BOM，表头/指标/8 周数据可读
- 文件：`.tmp/v2-p4/export-check.png` / `export-check.csv`

## 4. 对比度（AA）

e2e 亮/暗均断言 ≥4.5：`--t-1`、`--t-3`、`--on-accent` vs `--btn-from`、`--accent-ink`、`--accent`、`--success-ink`、`--warn-ink`、`--danger`。

## 5. 截图 diff

- 与 P3 基线（4600020）同 30 张逐像素 diff：**0 差异**（颜色 refactor 无布局/视觉位移）。
- P4 截图：`.tmp/v2-p4/`。

## 6. 测试

`412 × 2` 单测 + `112` e2e（含 `color-v2` 亮/暗 token、图表、签名）。

