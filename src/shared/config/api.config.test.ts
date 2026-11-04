import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildProxyRequestUrl,
  getProxyEndpoints,
  loadVideoSources,
  normalizeProxyPrefix,
} from './api.config'
import { rewriteM3u8Urls } from '../lib/proxy'

describe('proxy configuration', () => {
  it('正确解析单个或多个代理端点池', () => {
    expect(getProxyEndpoints(null)).toEqual(['/proxy?url='])
    expect(getProxyEndpoints('')).toEqual(['/proxy?url='])
    expect(getProxyEndpoints('https://p1.example.com')).toEqual(['https://p1.example.com'])
    expect(
      getProxyEndpoints('https://p1.example.com, https://p2.example.com\nhttps://p3.example.com'),
    ).toEqual(['https://p1.example.com', 'https://p2.example.com', 'https://p3.example.com'])
  })

  it('规范化代理前缀', () => {
    expect(normalizeProxyPrefix('https://p1.example.com')).toBe('https://p1.example.com?url=')
    expect(normalizeProxyPrefix('https://p1.example.com/api?foo=1')).toBe(
      'https://p1.example.com/api?foo=1&url=',
    )
    expect(normalizeProxyPrefix('https://p1.example.com/{url}/tail')).toBe(
      'https://p1.example.com/{url}/tail',
    )
  })

  it('代理请求构建支持从端点池中负载均衡分发', () => {
    const target = 'http://stream.example.com/live.m3u8'
    const proxies = 'https://w1.workers.dev,https://w2.workers.dev'
    const res = buildProxyRequestUrl(target, proxies)
    const valid = [
      `https://w1.workers.dev?url=${encodeURIComponent(target)}`,
      `https://w2.workers.dev?url=${encodeURIComponent(target)}`,
    ]
    expect(valid).toContain(res)
  })

  it('rewriteM3u8Urls 正确重写 EXT-X-MAP, EXT-X-MEDIA, EXT-X-KEY 及切片相对路径 (P2)', () => {
    const baseUrl = 'http://example.com/hls/live.m3u8'
    const playlist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MAP:URI="init.mp4"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"
#EXT-X-KEY:METHOD=AES-128,URI="key.key"
#EXTINF:4.000,
chunk1.ts
#EXTINF:4.000,
http://other.com/chunk2.ts`

    const rewritten = rewriteM3u8Urls(playlist, baseUrl)
    expect(rewritten).toContain('URI="http://example.com/hls/init.mp4"')
    expect(rewritten).toContain('URI="http://example.com/hls/audio.m3u8"')
    expect(rewritten).toContain('URI="http://example.com/hls/key.key"')
    expect(rewritten).toContain('http://example.com/hls/chunk1.ts')
    expect(rewritten).toContain('http://other.com/chunk2.ts')
  })
})

describe('loadVideoSources', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('解析完整配置中的视频源数组', async () => {
    const sources = await loadVideoSources([
      { name: '测试源', url: 'https://video.example.com/api', retry: 0 },
    ])

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      id: 'env_source_0',
      name: '测试源',
      detailUrl: 'https://video.example.com/api',
      retry: 0,
    })
  })

  it('通过代理加载完整配置中的远程视频源', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([{ name: '远程源', url: 'https://remote.example/api' }]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const sources = await loadVideoSources('https://example.com/sources.json')

    expect(fetchMock).toHaveBeenCalledWith(
      `/proxy?url=${encodeURIComponent('https://example.com/sources.json')}`,
    )
    expect(sources[0]).toMatchObject({ name: '远程源', url: 'https://remote.example/api' })
  })
})
