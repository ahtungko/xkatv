import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { collectProjectMetadata, escapeHtml } from './scripts/project-metadata.mjs'
import { proxyMiddleware } from './src/middleware/proxy.dev'

const project = collectProjectMetadata()
const manifest = JSON.stringify({
  ...JSON.parse(readFileSync('public/site.webmanifest', 'utf8')),
  name: project.name,
  short_name: project.name,
  description: project.description,
})

// https://vite.dev/config/
export default defineConfig({
  define: { __PROJECT_METADATA__: JSON.stringify(project) },
  envPrefix: ['XKA_'],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    proxyMiddleware(),
    {
      name: 'project-metadata',
      transformIndexHtml(html) {
        return html
          .replace(/__PROJECT_NAME__/g, () => escapeHtml(project.name))
          .replace(/__PROJECT_DESCRIPTION__/g, () => escapeHtml(project.description))
          .replace(/__PROJECT_OWNER__/g, () => escapeHtml(project.owner))
      },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== '/site.webmanifest') return next()
          response.setHeader('Content-Type', 'application/manifest+json')
          response.end(manifest)
        })
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'site.webmanifest', source: manifest })
      },
    },
  ],
  build: {
    // Analysis builds opt in via --manifest and use a separate output directory.
    manifest: false,
    // 优化构建性能
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // 按包路径匹配，避免将 zustand/esm/react 等子目录误归入框架分块。
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router/')
          ) {
            return 'react-vendor'
          }

          // 播放器相关（拆分大包，避免单 chunk 过大）
          if (id.includes('/artplayer/')) return 'artplayer-vendor'
          if (id.includes('/hls.js/')) return 'hls-vendor'

          // UI 与动效
          if (id.includes('/framer-motion/')) return 'motion-vendor'
          if (id.includes('/@radix-ui/')) return 'radix-vendor'

          // 其他常用库
          if (id.includes('/zustand/')) return 'state-vendor'
          if (id.includes('/tmdb-ts/')) return 'tmdb-vendor'
          if (id.includes('/dayjs/')) return 'dayjs-vendor'
        },
      },
    },
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 构建目标
    target: 'es2020',
    // 启用源码映射（用于调试）
    sourcemap: false,
  },
  // 服务器配置
  server: {
    port: 3000,
    strictPort: false,
  },
})
