// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'

interface Chunk {
  file: string
  name?: string
  imports?: string[]
}

const script = resolve('scripts/analyze-bundle.mjs')
const directories: string[] = []
const routesSource = 'src/app/router/routes.tsx'
const playerSource = 'src/features/player/components/UnifiedPlayer.tsx'

function analyze(routeKey: string, options: { omitPlayer?: boolean; renamePlayer?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'xkatv-bundle-'))
  directories.push(directory)
  const manifest: Record<string, Chunk> = {
    'index.html': { file: 'assets/entry.js' },
    'src/shared/components/AuthGuard.tsx': { file: 'assets/auth.js', imports: ['index.html'] },
    'src/features/home/views/HomeView.tsx': { file: 'assets/home.js', imports: ['shared'] },
    shared: { file: 'assets/shared.js', imports: ['index.html'] },
    [routeKey]: { file: 'assets/routes.js', name: 'routes', imports: ['shared'] },
  }
  if (!options.omitPlayer) {
    manifest[options.renamePlayer ? '_UnifiedPlayer-hash.js' : playerSource] = {
      file: 'assets/player.js', name: 'UnifiedPlayer',
    }
  }
  // Exact source keys must take priority over another chunk with the same name.
  if (routeKey === routesSource) {
    manifest.unrelated = { file: 'assets/unrelated.js', name: 'routes' }
  }
  mkdirSync(join(directory, '.vite'))
  mkdirSync(join(directory, 'assets'))
  writeFileSync(join(directory, '.vite/manifest.json'), JSON.stringify(manifest))
  const sizes: Record<string, number> = {
    'assets/entry.js': 10,
    'assets/auth.js': 20,
    'assets/home.js': 30,
    'assets/shared.js': 500,
    'assets/routes.js': 4000,
    'assets/player.js': 70,
    'assets/unrelated.js': 10_000,
  }
  for (const chunk of Object.values(manifest)) {
    writeFileSync(join(directory, chunk.file), Buffer.alloc(sizes[chunk.file], 'x'))
  }
  return execFileSync(process.execPath, [script, directory], { encoding: 'utf8' })
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith('xkatv-bundle-')) {
      throw new Error('拒绝清理临时测试目录以外的路径')
    }
    rmSync(directory, { recursive: true, force: true })
  }
})

it.each([routesSource, '_routes-hash.js'])('识别路由清单键 %s 并去重静态依赖', key => {
  const output = analyze(key)
  const home = output.split('\n').find(line => line.includes('首页 JS（含布局和认证）'))
  expect(home).toContain('4.56')
  const login = output.split('\n').find(line => line.includes('登录页 JS（含认证守卫）'))
  expect(login).toContain('0.03')
})

it('没有独立播放器分块时显示不可用，继续统计其他范围', () => {
  const output = analyze('_routes-hash.js', { omitPlayer: true })
  const player = output.split('\n').find(line => line.includes('播放器页面自身 JS'))
  expect(player).toContain('不可用')
  expect(output).toContain('全部 JS（含按需加载）')
})

it('播放器清单键变化后仍可按模块名找到分块', () => {
  const output = analyze('_routes-hash.js', { renamePlayer: true })
  const player = output.split('\n').find(line => line.includes('播放器页面自身 JS'))
  expect(player).toContain('0.07')
})
