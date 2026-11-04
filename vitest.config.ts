import { defineConfig } from 'vitest/config'

/**
 * 测试配置单独一份：单元测试只覆盖 core 层的纯函数（零 DOM、零 IO），
 * 因此不需要 react 插件，跑得也快。
 */
export default defineConfig({
  resolve: {
    alias: { '@': '/src' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 用线程池而不是进程池：不依赖子进程管道，受限环境下也能跑
    pool: 'threads',
  },
})
