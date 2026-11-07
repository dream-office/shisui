# 第三方依赖与许可声明

本项目的运行与构建依赖以下第三方组件。完整的许可原文随构建产物一起发布，可通过
`/licenses/` 路径访问（`public/licenses/` 会原样复制到站点根目录）。

| 组件 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| [Dexie](https://dexie.org/) | 4.4.7 | **Apache-2.0**（含 NOTICE） | IndexedDB 封装 |
| [React](https://react.dev/) / React DOM | 18.3.1 | MIT | UI 渲染 |
| [Zustand](https://zustand.docs.pmnd.rs/) | 5.0.2 | MIT | 状态管理 |

许可原文：

- [`dexie-Apache-2.0.txt`](./dexie-Apache-2.0.txt) · [`dexie-NOTICE.txt`](./dexie-NOTICE.txt)
- [`react-MIT.txt`](./react-MIT.txt) · [`react-dom-MIT.txt`](./react-dom-MIT.txt)
- [`zustand-MIT.txt`](./zustand-MIT.txt)

## 说明

- 本项目自身：应用本体 **AGPL-3.0-or-later**，解析核心包 `shisui-core` **MIT**（见仓库根 `LICENSE` 与 `packages/core/LICENSE`）。
- `shisui-core` 零运行时依赖；上表只涉及应用层。
- 构建工具链（Vite、TypeScript、Vitest、Playwright）不随产物分发，许可信息见各自的 `package.json`。
