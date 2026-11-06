import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * 测试配置单独一份：单元测试只覆盖 core 层的纯函数（零 DOM、零 IO），
 * 因此不需要 react 插件，跑得也快。
 *
 * 核心已经拆到 packages/core（MIT），测试跟着源码在那边跑。
 */
const coreEntry = fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': '/src', 'shisui-core': coreEntry },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'packages/**/*.test.ts'],
    // 用线程池而不是进程池：不依赖子进程管道，受限环境下也能跑
    pool: 'threads',
  },
})
