# 部署

站点是纯静态的（无后端、无环境变量），所以部署方式只有一条要求：**把 `dist/` 里的文件放到一个能访问的地方**。

当前线上版本：**https://dream-office.github.io/kedaibiao/**

## 当前方式：GitHub Pages · 分支发布

推送 `gh-pages` 分支即发布，由 GitHub 服务端直接托管，**不消耗 Actions 运行**。

```bash
pnpm deploy:pages      # = pnpm build + node scripts/publish-pages.mjs
```

> 脚本特意不叫 `deploy` 或 `publish`：这两个都是 pnpm 的内置命令，会盖掉同名脚本。

脚本做的事：把 `dist/` 拷到临时目录 → 加 `.nojekyll` → 提交 → 强制推送到 `gh-pages`。
`gh-pages` 是每次覆盖的产物分支，不进 `main` 的历史。

仓库设置（只需配一次）：**Settings → Pages → Source 选「Deploy from a branch」→ 分支 `gh-pages` / 目录 `/`**。

> 站点使用相对路径（`vite.config.ts` 里 `base: './'`），所以放在 `/kedaibiao/` 这种子路径下也能正常工作，
> 换到任意静态托管（Cloudflare Pages、Netlify、对象存储、内网 Nginx）都只需原样上传 `dist/`。

## 备选：GitHub Actions

仓库曾经用 `actions/deploy-pages` 自动部署（构建 + 上传 + 发布全在 CI 里完成）。
优点是「推送即部署、无需本地构建」，缺点是对新账号的 Actions 队列不稳定。

如果将来要切回 Actions：

1. 新建 `.github/workflows/pages.yml`：

   ```yaml
   name: pages
   on:
     push:
       branches: [main]
     workflow_dispatch:
   permissions:
     contents: read
     pages: write
     id-token: write
   concurrency:
     group: pages
     cancel-in-progress: true
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v5
         - uses: pnpm/action-setup@v4        # 版本以 package.json 的 packageManager 为准
         - uses: actions/setup-node@v5
           with:
             node-version: 22                 # pnpm 11 需要 Node >= 22.13
             cache: pnpm
         - run: pnpm install --frozen-lockfile
         - run: pnpm build
         - uses: actions/upload-pages-artifact@v3
           with:
             path: dist
     deploy:
       needs: build
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - id: deployment
           uses: actions/deploy-pages@v4
   ```

2. Settings → Pages → Source 改回 **GitHub Actions**。

两种方式不要同时启用：Pages 的 Source 只有一个，另一个会一直失败。

## 其它托管

| 平台 | 做法 |
| --- | --- |
| Cloudflare Pages / Netlify / Vercel | 构建命令 `pnpm build`，输出目录 `dist` |
| Nginx / 对象存储 | `pnpm build` 后把 `dist/` 整个上传 |
| 本地验证 | `pnpm build && pnpm preview` → http://127.0.0.1:4173 |

## 发布前检查

```bash
pnpm check     # 类型检查 + 单测
```
