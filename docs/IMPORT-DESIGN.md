# v1.3.0 识图 / 文档导入 · 设计要点

> 目标：文档在**本地**解析；图片可选**本地 OCR**或**AI 识图**，AI 路径必须逐次确认。
> 版本：app 1.3.0 / core 1.1.0（无 DB/备份/ICS 改动）。

## 1. 依赖与体积（实测）

| 依赖 | 版本 | 原始体积 | gzip | 许可 | 加载方式 |
| --- | --- | --- | --- | --- | --- |
| pdfjs-dist | 6.5.438 | main 463KB + worker 1.24MB | 133KB + 370KB | Apache-2.0 | 动态 import；worker 走 `?url` 本地 asset |
| mammoth | 1.13.0 | browser.min 396KB | 99KB | BSD-2-Clause | 动态 import UMD 浏览器包 |
| tesseract.js | 7.0.0 | main 62KB + worker 109KB | 10KB + 33KB | Apache-2.0 | 动态 import；worker `?url` |
| tesseract.js-core | 7.0.0 | wasm 2.79MB（simd-lstm） | 1.04MB | Apache-2.0 | 首次 OCR 时加载，`?url` 本地 |
| chi_sim（best_int） | 4.0.0 | 2.36MB | — | Apache-2.0 | 首次 OCR 确认后从本站 `/tessdata/` 加载（未 gzip，避免误判为备份文件） |
| eng（best_int） | 4.0.0 | 4.96MB | — | Apache-2.0 | 同上 |

- **首屏**：所有重依赖动态 import，主 chunk 预计仅增加 UI/服务入口约 **2–4KB gzip**（目标 +30KB 内，实测见交付报告）。
- **按需加载**：PDF ≈ 503KB gzip；DOCX ≈ 99KB；OCR 首次 ≈ **8.4MB**（worker+wasm+chi_sim+eng，浏览器缓存后离线）。
- 许可文件复制到 `public/licenses/`：`tesseract.js-Apache-2.0.txt`、`tessdata-Apache-2.0.txt`、`pdfjs-Apache-2.0.txt`、`mammoth-BSD.txt`。

## 2. 模块

```
src/services/documentImport.ts   PDF/DOCX/TXT/MD → 文本
src/services/ocr.ts              tesseract.js 本地 OCR（声明门控 + 懒加载）
src/services/imageImport.ts      图片压缩 / AI 识图请求
src/services/fileLimits.ts       大小/类型/截断规则（纯函数）
src/ui/ImportPanel.tsx           「导入文档 / 识别图片」入口 + 声明/确认
src/ui/SettingsView.tsx          图片识别模式（三选一 + 关闭）
```

- 文档解析结果填入收件 textarea（可编辑后再解析）；文件名不写入 `rawText`。
- PDF：先取文本层；`page.getTextContent()` 拼接；无文本 → 「扫描版暂不支持，请拍照/截图」。
- DOCX：mammoth `extractRawText`；`.doc` 拒绝并提示另存为 `.docx`。
- 限制：文档 ≤20MB、图片 ≤10MB、文本 ≤50k 字（截断 + 提示）；拒绝 `.xls/.ppt/.doc`。
- 图片：canvas 压到长边 ≤1600、JPEG 0.8；AI 用 `image_url` data URL；模型不支持视觉 → 可读错误，不自动重试。
- 复用现有 `buildMessages` 抽取规则（按行动拆/去重/url/note），图片返回走 `parseLLMResponse`。

## 3. 图片识别开关（持久化 `shisui.imageMode`）

| 值 | 含义 |
| --- | --- |
| `ask`（默认） | 每次导入图片弹选择：本地 OCR / AI 识图 / 取消 |
| `local` | 本地 OCR（离线），首次需声明确认 |
| `ai` | AI 识图；未配置 API 时禁用并说明 |
| `off` | 关闭图片识别（图片按钮禁用） |

- AI 永远不是默认；即使选 `ai`，**每次上传前仍需勾选**「图片将发送到你配置的 AI 服务」。
- 本地 OCR 首次使用弹声明：设备本地运行/不上传/占内存/耗时（桌面 2–8s、手机 5–15s）/低端机可能卡顿/手写暗光有限，需人工核对。
- 语言包从本站 `/tessdata/` 加载（非 CDN），确认后才开始加载；缓存后离线。
- `navigator.deviceMemory` 较低时提示建议 AI 识图，不强制。

## 4. 隐私边界

- 本地文档与 OCR：**0 外网请求**（测试用 route 拦截断言）。
- AI 图片：仅在「已配置 API + 用户本次勾选确认」时发往用户配置的服务；base64 不写日志、不落库。
- 文件名可显示，不写入任务 `rawText`/备份/仓库。
- README「图片识别」、设置页说明、本文件（隐私节）、CHANGELOG 同步。

## 5. 测试矩阵

- 文档：TXT/MD；PDF 文本层；DOCX；扫描 PDF 提示；超限/截断；`.doc` 拒绝。
- 图片：`off` 禁用；`ai` 未配置禁用；`ask` 未确认 0 请求（Playwright route）；确认后 mock 视觉响应 → 解析出任务；不支持视觉错误。
- OCR：首次声明未确认不加载语言包；mock OCR 成功/失败；全程 0 外网请求。
- 开关：四种模式持久化；AI 未配置禁用。
- 首屏包大小对比；旧 371 单测 / 61 e2e 不退化；DB v4 不动。

## 6. 依赖许可

- Tesseract.js / tesseract.js-core / tessdata：Apache-2.0
- pdf.js：Apache-2.0
- mammoth：BSD-2-Clause
- 新依赖均只在用户主动导入文档/图片时加载，不改变默认本地优先行为。
