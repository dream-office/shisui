import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 相对路径：构建产物可直接放到任意子路径下（GitHub Pages 项目页、对象存储子目录都能用）
  base: './',
  resolve: {
    alias: { '@': '/src' },
  },
  server: { port: 5173 },
})
