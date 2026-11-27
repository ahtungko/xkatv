import { describe, expect, it, vi } from 'vitest'
import {
  buildBatchDetailUrl,
  extractPlayableEpisodeNumbers,
  loadCmsSourcesMap,
  parseCmsSourcesMap,
  runSeriesCheck,
  sourceReportsCompleted,
  timingSafeEqual,
} from './index.js'

describe('series-notifier worker helpers', () => {
  it('parses object, array (with env_source_N fallback), and xkaTV config formats', () => {
    const fromObject = parseCmsSourcesMap('{"srcA": "https://a.example.com/api.php/provide/vod"}')
    expect(fromObject.get('srcA')).toBe('https://a.example.com/api.php/provide/vod')

    const fromArray = parseCmsSourcesMap(
      JSON.stringify([
        { id: 'srcB', url: 'https://b.example.com/vod', detailUrl: 'https://b.example.com/detail' },
        { name: 'NoIdSource', url: 'https://c.example.com' },
      ]),
    )
    expect(fromArray.get('srcB')).toBe('https://b.example.com/detail')
    expect(fromArray.get('env_source_1')).toBe('https://c.example.com')

    const fromConfig = parseCmsSourcesMap(
      JSON.stringify({ videoSources: [{ name: 'CfgSource', url: 'https://d.example.com' }] }),
    )
    expect(fromConfig.get('env_source_0')).toBe('https://d.example.com')
  })

  it('loads CMS_SOURCES_JSON from a remote URL link', async () => {
    const mockFetch = vi.fn(async () =>
      Response.json([
        { name: 'Remote1', url: 'https://r1.example.com' },
        { id: 'custom_id', name: 'Remote2', url: 'https://r2.example.com/api.php/provide/vod' },
      ]),
    )
    const budget = { fetch: mockFetch }
    const map = await loadCmsSourcesMap('https://cdn.example.com/sources.json', budget)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(map.get('env_source_0')).toBe('https://r1.example.com')
    expect(map.get('custom_id')).toBe('https://r2.example.com/api.php/provide/vod')
  })

  it('builds comma-separated batch detail URLs matching cms-core path rules', () => {
    expect(buildBatchDetailUrl('https://a.example.com/api.php/provide/vod/', ['10', '20'])).toBe(
      'https://a.example.com/api.php/provide/vod?ac=videolist&ids=10,20',
    )
    expect(buildBatchDetailUrl('https://a.example.com/', ['10', '20'])).toBe(
      'https://a.example.com/api.php/provide/vod/?ac=videolist&ids=10,20',
    )
  })

  it('extracts playable main episodes and ignores trailers', () => {
    const episodes = extractPlayableEpisodeNumbers({
      vod_play_from: 'other$$$m3u8',
      vod_play_url:
        '第01集$https://other.example/1.mp4$$$第01集$https://cdn.example/1.m3u8#预告$https://cdn.example/t.m3u8#第02集$https://cdn.example/2.m3u8',
    })
    expect(episodes).toEqual([1, 2])
  })

  it('detects completion remarks accurately', () => {
    expect(sourceReportsCompleted('全24集')).toBe(true)
    expect(sourceReportsCompleted('已完结')).toBe(true)
    expect(sourceReportsCompleted('更新至第12集')).toBe(false)
    expect(sourceReportsCompleted('连载中')).toBe(false)
  })

  it('performs constant-time secret equality checks', () => {
    expect(timingSafeEqual('secret-123', 'secret-123')).toBe(true)
    expect(timingSafeEqual('secret-123', 'secret-124')).toBe(false)
    expect(timingSafeEqual('short', 'much-longer')).toBe(false)
  })
})

describe('runSeriesCheck end-to-end', () => {
  const duePayload = {
    channels: [
      {
        user_id: 'u1',
        telegram_enabled: true,
        telegram_bot_token: '123456789:AAH_valid_bot_token_123456789',
        telegram_chat_id: '111111',
        discord_enabled: false,
        discord_webhook_url: '',
        webhook_enabled: false,
        webhook_url: '',
        webhook_secret: '',
      },
      {
        user_id: 'u2',
        telegram_enabled: false,
        telegram_bot_token: '',
        telegram_chat_id: '',
        discord_enabled: true,
        discord_webhook_url: 'https://discord.com/api/webhooks/999/secret',
        webhook_enabled: true,
        webhook_url: 'https://hooks.example.com/xkatv',
        webhook_secret: 'my-secret',
      },
    ],
    items: [
      {
        user_id: 'u1',
        resource_hash: 'h1',
        tracking_key: 'tmdb_tv_1::1',
        source_code: 'src1',
        vod_id: '101',
        known_episodes: [1, 2],
        title: '剧集A',
      },
      {
        user_id: 'u2',
        resource_hash: 'h2',
        tracking_key: 'tmdb_tv_1::1',
        source_code: 'src1',
        vod_id: '101',
        known_episodes: [1, 2],
        title: '剧集A',
      },
      {
        user_id: 'u2',
        resource_hash: 'h3',
        tracking_key: 'tmdb_tv_2::1',
        source_code: 'src1',
        vod_id: '102',
        known_episodes: [1],
        title: '剧集B',
      },
    ],
  }

  it('uses 2 Supabase RPCs + 1 CMS batch fetch and sends 1 digest per user', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = []

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'
      const body = typeof init?.body === 'string' ? init.body : undefined
      calls.push({ url, method, body })

      if (url.includes('/rest/v1/rpc/get_due_series_notifications')) {
        return Response.json(duePayload)
      }

      if (url.includes('/rest/v1/rpc/batch_update_series_notifications')) {
        return Response.json(3)
      }

      if (url.startsWith('https://cms.example.com/api.php/provide/vod?ac=videolist&ids=')) {
        return Response.json({
          list: [
            {
              vod_id: '101',
              vod_name: '剧集A',
              vod_remarks: '更新至第3集',
              vod_play_from: 'm3u8',
              vod_play_url:
                '第01集$https://v/1.m3u8#第02集$https://v/2.m3u8#第03集$https://v/3.m3u8',
            },
            {
              vod_id: '102',
              vod_name: '剧集B',
              vod_remarks: '已完结',
              vod_play_from: 'm3u8',
              vod_play_url: '第01集$https://v/1.m3u8#第02集$https://v/2.m3u8',
            },
          ],
        })
      }

      return Response.json({ ok: true })
    })

    const summary = await runSeriesCheck(
      {
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        CMS_SOURCES_JSON: JSON.stringify({ src1: 'https://cms.example.com/api.php/provide/vod' }),
      },
      mockFetch as unknown as typeof fetch,
    )

    // Total subrequests: 1 due RPC + 1 CMS batch + 1 batch update RPC + 3 pushes = 6!
    expect(summary.subrequestsUsed).toBe(6)
    const cmsCalls = calls.filter(c => c.url.startsWith('https://cms.example.com'))
    expect(cmsCalls).toHaveLength(1)
    expect(cmsCalls[0].url).toContain('ids=101,102')

    const telegramCalls = calls.filter(c => c.url.startsWith('https://api.telegram.org'))
    const discordCalls = calls.filter(c => c.url.startsWith('https://discord.com'))
    const webhookCalls = calls.filter(c => c.url.startsWith('https://hooks.example.com'))
    expect(telegramCalls).toHaveLength(1)
    expect(discordCalls).toHaveLength(1)
    expect(webhookCalls).toHaveLength(1)
    expect(discordCalls[0].body).toContain('剧集A')
    expect(discordCalls[0].body).toContain('剧集B')

    expect(summary.checkedSources).toBe(1)
    expect(summary.checkedResources).toBe(2)
    expect(summary.updatedRows).toBe(3)
    expect(summary.notifiedUsers).toBe(2)
    expect(summary.errors).toEqual([])
  })

  it('aborts notification delivery if batch DB update fails to prevent duplicate spam', async () => {
    const pushCalls: string[] = []
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/rest/v1/rpc/get_due_series_notifications')) {
        return Response.json(duePayload)
      }
      if (url.includes('/rest/v1/rpc/batch_update_series_notifications')) {
        return new Response('db error', { status: 500 })
      }
      if (url.startsWith('https://cms.example.com')) {
        return Response.json({
          list: [
            {
              vod_id: '101',
              vod_name: '剧集A',
              vod_remarks: '更新至第3集',
              vod_play_from: 'm3u8',
              vod_play_url:
                '第01集$https://v/1.m3u8#第02集$https://v/2.m3u8#第03集$https://v/3.m3u8',
            },
          ],
        })
      }
      pushCalls.push(url)
      return Response.json({ ok: true })
    })

    const summary = await runSeriesCheck(
      {
        SUPABASE_URL: 'https://proj.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        CMS_SOURCES_JSON: JSON.stringify({ src1: 'https://cms.example.com/api.php/provide/vod' }),
      },
      mockFetch as unknown as typeof fetch,
    )

    expect(pushCalls).toEqual([])
    expect(summary.notifiedUsers).toBe(0)
    expect(summary.errors[0]).toContain('batch_update:')
  })
})
