import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const directory = resolve(process.argv[2] || '.generated/bundle-analysis')
let manifest
try {
  manifest = JSON.parse(readFileSync(resolve(directory, '.vite/manifest.json'), 'utf8'))
} catch (error) {
  throw new Error('请先运行 pnpm build:analyze，或传入包含 .vite/manifest.json 的分析构建目录。', {
    cause: error,
  })
}

// Follow static imports only: lazy routes and HLS are loaded when requested.
function dependencies(entries) {
  const visited = new Set()
  const files = new Set()
  function visit(key) {
    if (visited.has(key)) return
    visited.add(key)
    const chunk = manifest[key]
    if (!chunk) throw new Error(`构建清单缺少入口：${key}`)
    if (chunk.file.endsWith('.js')) files.add(chunk.file)
    for (const dependency of chunk.imports || []) visit(dependency)
  }
  entries.forEach(visit)
  return [...files]
}

function size(files) {
  return files.reduce(
    (total, file) => {
      const bytes = readFileSync(resolve(directory, file))
      total.raw += bytes.length
      total.gzip += gzipSync(bytes).length
      return total
    },
    { raw: 0, gzip: 0 },
  )
}

function findChunk(source, name, required = false) {
  if (manifest[source]) return source
  const matches = Object.entries(manifest).filter(([, chunk]) => chunk.src === source)
  const candidates =
    matches.length > 0
      ? matches
      : Object.entries(manifest).filter(([, chunk]) => chunk.name === name)
  if (candidates.length > 1) throw new Error(`构建清单中的模块名称不唯一：${name}`)
  if (candidates.length === 1) return candidates[0][0]
  if (required) throw new Error(`构建清单缺少入口：${source}（模块名：${name}）`)
  return null
}

const login = ['index.html', findChunk('src/shared/components/AuthGuard.tsx', 'AuthGuard', true)]
const home = [...login, findChunk('src/features/home/views/HomeView.tsx', 'HomeView', true)]
const routes = findChunk('src/app/router/routes.tsx', 'routes')
if (routes) home.push(routes)
// Older builds bundled MainLayout into index.html or the protected router.
const mainLayout = findChunk('src/app/layouts/MainLayout.tsx', 'MainLayout')
if (mainLayout) home.push(mainLayout)
const player = findChunk('src/features/player/components/UnifiedPlayer.tsx', 'UnifiedPlayer')
const allJs = readdirSync(resolve(directory, 'assets'))
  .filter(file => file.endsWith('.js'))
  .map(file => `assets/${file}`)

const rows = [
  ['入口静态 JS', dependencies(['index.html'])],
  ['登录页 JS（含认证守卫）', dependencies(login)],
  ['首页 JS（含布局和认证）', dependencies(home)],
  ['播放器页面自身 JS', player ? [manifest[player].file] : null],
  ['全部 JS（含按需加载）', allJs],
]

console.log(`构建目录：${directory}`)
console.table(
  rows.map(([scope, files]) => {
    if (!files) return { 范围: scope, 文件数: '不可用', '原始 kB': '—', 'gzip kB': '—' }
    const bytes = size(files)
    return {
      范围: scope,
      文件数: files.length,
      '原始 kB': (bytes.raw / 1000).toFixed(2),
      'gzip kB': (bytes.gzip / 1000).toFixed(2),
    }
  }),
)
console.log('按依赖去重统计，1 kB = 1000 字节；不含图片、字体、CSS 和运行时 API 请求。')
console.log('首页不含按状态弹出的公告/更新日志；gzip 为逐文件压缩估算，非浏览器测速。')
if (!player) console.log('该构建未包含独立的播放器页面分块，播放器自身大小不可单独统计。')
