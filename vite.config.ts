import { fileURLToPath } from 'node:url'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 核心包在 workspace 里以源码形式消费（改完立刻生效，不用先 build）
const coreEntry = fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url))

/**
 * 构建产物里不允许出现外部 CDN 兜底地址（Tesseract 默认值）。
 * 运行时我们始终显式传 workerPath/corePath/langPath，这里只替换库的默认字符串。
 */
function stripExternalDefaults(): Plugin {
  return {
    name: 'strip-external-defaults',
    generateBundle(_options, bundle) {
      const replace = (value: string) =>
        value
          .replaceAll('https://cdn.jsdelivr.net/npm/', './local-vendor/')
          .replaceAll('https://cdn.jsdelivr.net/', './local-vendor/')
          .replaceAll('https://unpkg.com/', './local-vendor/')
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') {
          item.code = replace(item.code)
          continue
        }
        // worker 以静态 asset 形式复制，不经过 chunk 代码处理
        if (typeof item.source === 'string') {
          item.source = replace(item.source)
        } else if (item.source instanceof Uint8Array) {
          const text = new TextDecoder().decode(item.source)
          if (text.includes('cdn.jsdelivr.net') || text.includes('unpkg.com')) {
            item.source = replace(text)
          }
        }
      }
    },
  }
}

function embeddedShell(embedded: boolean, outDir: string): Plugin {
  return {
    name: 'embedded-shell',
    transformIndexHtml(html) {
      if (!embedded) return html
      return html
        .replace('<html lang="zh-CN">', '<html lang="zh-CN" data-shell="embedded">')
        .replace(/<script data-theme-boot>[\s\S]*?<\/script>\s*/, '')
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
        .replace(/\s*<meta name="apple-[^"]+"[^>]*>/g, '')
        .replace(/\s*<meta name="theme-color"[^>]*>/, '')
        .replace(/\s*<meta name="color-scheme"[^>]*>/, '')
    },
    closeBundle() {
      if (!embedded) return
      for (const file of ['sw.js', 'manifest.webmanifest', 'manifest.en.webmanifest']) {
        rmSync(join(outDir, file), { force: true })
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const embedded = mode === 'embedded'
  const outDir = embedded ? 'dist/embedded' : 'dist'
  return {
  plugins: [react(), stripExternalDefaults(), embeddedShell(embedded, outDir)],
  define: { __EMBEDDED__: JSON.stringify(embedded) },
  // 相对路径：构建产物可直接放到任意子路径下（GitHub Pages 项目页、对象存储子目录都能用）
  base: embedded ? '/projects/shisui/' : './',
  resolve: {
    alias: { '@': '/src', 'shisui-core': coreEntry },
  },
  server: { port: 5173 },
  build: { outDir },
  }
})
