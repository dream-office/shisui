import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 核心包在 workspace 里以源码形式消费（改完立刻生效，不用先 build）
const coreEntry = fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url))

export default defineConfig({
  plugins: [react()],
  // 相对路径：构建产物可直接放到任意子路径下（GitHub Pages 项目页、对象存储子目录都能用）
  base: './',
  resolve: {
    alias: { '@': '/src', 'shisui-core': coreEntry },
  },
  server: { port: 5173 },
})
