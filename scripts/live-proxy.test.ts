// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import handler from '../api/proxy'
import { onRequest } from '../functions/proxy'
// @ts-expect-error Standalone deployment script has no TypeScript declaration.
import worker from '../workers/live-stream-proxy/index.js'
import { rewriteM3u8Urls } from '../shared/proxy-core.js'

afterEach(() => vi.unstubAllGlobals())
const playlist = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-KEY:URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\nsegment.ts'
it('keeps child playlists, keys and segments on the native proxy recursively', () => {
  const prefix = '/proxy?native=1&url='
  const rewritten = rewriteM3u8Urls(playlist, 'http://origin.test/live/index.m3u8', prefix)
  for (const resource of ['audio.m3u8', 'key.bin', 'init.mp4', 'segment.ts']) {
    expect(rewritten).toContain(prefix + encodeURIComponent('http://origin.test/live/' + resource))
  }
})
it.each(['worker', 'pages'])('%s rewrites native playlists and removes stale response headers', async deployment => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(playlist, {
    headers: { 'content-type': 'application/vnd.apple.mpegurl', 'content-length': '123', 'cache-control': 'max-age=60' },
  })))
  const request = new Request('https://proxy.test/proxy?native=1&url=http%3A%2F%2Forigin.test%2Flive.m3u8')
  const result = deployment === 'worker' ? await worker.fetch(request) : await onRequest({ request, env: {}, params: {} })
  expect(result.headers.get('cache-control')).toBe('no-store')
  expect(result.headers.has('content-length')).toBe(false)
  expect(await result.text()).toContain('https://proxy.test/proxy?native=1&url=http%3A%2F%2Forigin.test%2Fsegment.ts')
})
it('does not cache live manifests on Vercel', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(playlist, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })))
  const headers = new Map<string, string>()
  const res = { setHeader: (key: string, value: string) => headers.set(key, value), status() { return this }, send: vi.fn() }
  await handler({ method: 'GET', query: { url: 'http://origin.test/live.m3u8' } } as Parameters<typeof handler>[0], res as unknown as Parameters<typeof handler>[1])
  expect(headers.get('Cache-Control')).toBe('no-store')
})
