import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// '@' → '/src' 用 Vite 的根路径别名，避免为一行 alias 引入 @types/node
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' },
  },
  server: { port: 5173 },
})
