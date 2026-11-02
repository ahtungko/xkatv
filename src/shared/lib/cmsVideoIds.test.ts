import { describe, expect, it, vi } from 'vitest'
import {
  createDirectStrategy,
  DEFAULT_API_CONFIG,
  listVideos,
  normalizeVodId,
  searchVideos,
} from '@xkatv/cms-core'

describe('CMS 视频ID入口规范化', () => {
  it.each([83519, 0, '83519', '0083519', 'video_1-test'])('保留有效ID %j 的字符串形式', value => {
    expect(normalizeVodId(value)).toBe(String(value))
  })

  it.each([
    null,
    undefined,
    true,
    {},
    [],
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '',
    'a/b',
  ])('不把无效ID %j 强制转换为资源', value => {
    expect(normalizeVodId(value)).toBeNull()
  })

  it.each(['search', 'list'])('%s 结果把数字ID转换成字符串并保留前导零', async mode => {
    const source = { id: 'source', name: '源', url: 'https://example.com/api', isEnabled: true }
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        list: [
          { vod_id: 83519, vod_name: '剧集' },
          { vod_id: '0083519', vod_name: '另一资源' },
          { vod_id: null, vod_name: '无效' },
          { vod_id: {}, vod_name: '无效' },
        ],
      }),
    })
    const config = {
      requestAdapter: { fetch },
      proxyStrategy: createDirectStrategy(),
      apiConfig: DEFAULT_API_CONFIG,
    }
    const result =
      mode === 'search'
        ? await searchVideos('剧集', source, config)
        : await listVideos(source, config)
    expect(result.success).toBe(true)
    expect(result.items.map(item => item.vod_id)).toEqual(['83519', '0083519'])
    expect(result.items[0].source_code).toBe('source')
  })
})
