import { defineConfig, devices } from '@playwright/test'

/**
 * 端到端冒烟测试：用真浏览器跑一遍主路径。
 *
 * 为什么需要它：单元测试只覆盖 `shisui-core` 的纯函数（零 DOM、零 IO），
 * 发现不了「页面白屏」「控制台报错」「点了没反应」这类问题 ——
 * 而这恰恰是用户最先遇到的。
 *
 * 本地跑：
 *   pnpm test:e2e
 *   # 没装 chromium？用系统 Edge，省一次 120MB 下载：
 *   PLAYWRIGHT_CHANNEL=msedge pnpm test:e2e
 *
 * CI：先 `pnpm exec playwright install --with-deps chromium`。
 */
const PORT = 5199
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // 不录 trace：产物不进仓库，失败时看 reporter 输出与截图
    trace: 'off',
    ...(channel ? { channel } : {}),
  },
  projects: [{ name: channel ?? 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // 先构建再 preview：PWA 的 Service Worker 只在生产构建里注册，
    // 用 dev server 测不了「离线可用」和真实产物。
    // 直接用 node 跑 vite 入口，避免依赖 pnpm/npx 是否在 PATH 上。
    // --host 127.0.0.1 是必需的：默认只监听 localhost，在 CI 上可能解析到 ::1，
    // 而 baseURL 走 IPv4 127.0.0.1 → 连不上 → webServer 超时（不是产品问题）。
    command: `node node_modules/vite/bin/vite.js build --mode standalone && node node_modules/vite/bin/vite.js build --mode embedded && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    // CI 里绝不复用已有服务：避免"上一次残留的 dev server"让测试假绿
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
