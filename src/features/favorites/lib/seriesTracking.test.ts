import { describe, expect, it } from 'vitest'
import type { CmsFavoriteItem, TmdbFavoriteItem } from '../types/favorites'
import { FavoriteWatchStatus } from '../types/favorites'
import type { ViewingHistoryItem } from '@/shared/types/video'
import {
  playableEpisodes,
  completedReminderEpisodes,
  sourceReportsCompleted,
  trackingProgress,
  trackingPlayPath,
  type SeriesUpdate,
} from './seriesTracking'
import { checkSeriesUpdates } from './checkSeriesUpdates'
import { vi } from 'vitest'
import { parsePlayUrl } from '@xkatv/cms-core'

const cms: CmsFavoriteItem = {
  id: 'cms_a',
  sourceType: 'cms',
  addedAt: 1,
  updatedAt: 1,
  tags: [],
  watchStatus: FavoriteWatchStatus.WATCHING,
  tracking: { enabled: true },
  media: { vodId: 'a', vodName: '测试剧', sourceCode: 's', sourceName: '源' },
}
const tv: TmdbFavoriteItem = {
  ...cms,
  id: 'tmdb_tv_1',
  sourceType: 'tmdb',
  tracking: { enabled: true, seasonNumber: 2 },
  media: {
    id: 1,
    mediaType: 'tv',
    title: '测试剧',
    originalTitle: 'Test Show',
    releaseDate: '2024-01-01',
    posterPath: null,
    backdropPath: null,
    voteAverage: 8,
  },
}
const source = { id: 's', name: '源', url: 'https://example.com/api', isEnabled: true }
const update: SeriesUpdate = {
  attemptedAt: 10,
  checkedAt: 10,
  sourceCode: 's',
  vodId: 'a',
  episodes: Array.from({ length: 12 }, (_, index) => ({ index, number: index + 1 })),
}
const record = (overrides: Partial<ViewingHistoryItem> = {}): ViewingHistoryItem => ({
  recordType: 'cms',
  title: '测试剧',
  imageUrl: '',
  sourceCode: 's',
  sourceName: '源',
  vodId: 'a',
  episodeIndex: 8,
  episodeName: '第09集',
  timestamp: 1,
  playbackPosition: 95,
  duration: 100,
  ...overrides,
})
const detail = {
  success: true,
  episodes: ['https://example.com/1.m3u8', 'https://example.com/2.m3u8'],
  videoInfo: { title: '测试剧', episodes_names: ['第01集', '第02集'] },
}

describe('追更集数与进度', () => {
  it('只把视频源明确标注的状态视为完结', () => {
    for (const value of ['已完结', '完結', '全集', '全30集', '30集全', '更新至第30集已完结', '更新至第30集完结'])
      expect(sourceReportsCompleted(value)).toBe(true)
    for (const value of [undefined, '', '更新至30集', '未完结', '连载中', '更新至30集/全40集', '更新至30集未完结'])
      expect(sourceReportsCompleted(value)).toBe(false)
  })

  it('完成提醒按单集及季数识别，校准只确认本季范围', () => {
    const item = {
      ...tv,
      tracking: {
        enabled: true,
        seasonNumber: 2,
        progress: {
          '1': { completedEpisode: 12, calibratedAt: 100 },
          '2': { completedEpisode: 8, calibratedAt: 100 },
        },
      },
    }
    const reminders = {
      ...update,
      notification: { knownEpisodes: [8, 9, 10, 11], unreadEpisodes: [8, 9, 10, 11] },
    }
    const tvRecord = { recordType: 'tmdb' as const, tmdbMediaType: 'tv' as const, tmdbId: 1 }
    expect(
      completedReminderEpisodes(item, reminders, [
        record({ ...tvRecord, tmdbSeasonNumber: 1, episodeName: '第09集', timestamp: 101 }),
        record({ ...tvRecord, tmdbSeasonNumber: 2, episodeName: '第10集', playbackPosition: 89, timestamp: 101 }),
        record({ ...tvRecord, tmdbSeasonNumber: 2, episodeName: '第11集', playbackPosition: 90, timestamp: 101 }),
        record({ ...tvRecord, tmdbSeasonNumber: 2, episodeName: '第09集', timestamp: 99 }),
      ]),
    ).toEqual([8, 11])
  })

  it('校准可向前或向后修正，旧观看记录不会覆盖校准值', () => {
    for (const completedEpisode of [0, 3, 9]) {
      const item = {
        ...cms,
        tracking: { enabled: true, progress: { cms: { completedEpisode, calibratedAt: 100 } } },
      }
      const progress = trackingProgress(item, update, [
        record({ episodeName: '第11集', timestamp: 50 }),
      ])
      expect(progress).toMatchObject({
        completedThrough: completedEpisode,
        currentEpisode: completedEpisode,
        pendingCount: 12 - completedEpisode,
        calibrated: true,
      })
      expect(progress.nextEpisode?.number).toBe(completedEpisode + 1)
    }
  })

  it('校准后继续观看会自动推进，回看旧集不会降低校准进度', () => {
    const item = {
      ...cms,
      tracking: { enabled: true, progress: { cms: { completedEpisode: 9, calibratedAt: 100 } } },
    }
    expect(
      trackingProgress(item, update, [
        record({ episodeName: '第10集', timestamp: 101, playbackPosition: 95 }),
      ]),
    ).toMatchObject({ completedThrough: 10, currentEpisode: 10, pendingCount: 2 })
    expect(
      trackingProgress(item, update, [
        record({ episodeName: '第10集', timestamp: 101, playbackPosition: 40 }),
      ]),
    ).toMatchObject({ completedThrough: 9, currentEpisode: 10, pendingCount: 3 })
    expect(
      trackingProgress(item, update, [record({ episodeName: '第1集', timestamp: 101 })])
        .pendingCount,
    ).toBe(3)
  })

  it('校准按季隔离；已追平后新增的集数仍会计入待看', () => {
    const item = {
      ...tv,
      tracking: {
        enabled: true,
        seasonNumber: 2,
        progress: {
          '1': { completedEpisode: 12, calibratedAt: 100 },
          '2': { completedEpisode: 9, calibratedAt: 100 },
        },
      },
    }
    expect(trackingProgress(item, update, []).pendingCount).toBe(3)
    expect(
      trackingProgress({ ...item, tracking: { ...item.tracking, seasonNumber: 3 } }, update, [])
        .pendingCount,
    ).toBe(12)
    const caughtUp = {
      ...cms,
      tracking: { enabled: true, progress: { cms: { completedEpisode: 12, calibratedAt: 100 } } },
    }
    expect(
      trackingProgress(
        caughtUp,
        { ...update, episodes: [...update.episodes!, { index: 12, number: 13 }] },
        [],
      ).pendingCount,
    ).toBe(1)
  })

  it('过滤没有地址的占位集后，集名仍与播放索引对应', () => {
    const parsed = parsePlayUrl('第01集$https://x/1#第02集$#第03集$https://x/3')
    expect(parsed.names).toEqual(['第01集', '第03集'])
    expect(
      playableEpisodes({
        success: true,
        episodes: parsed.urls,
        videoInfo: { title: '剧', episodes_names: parsed.names },
      }),
    ).toEqual([
      { index: 0, number: 1 },
      { index: 1, number: 3 },
    ])
  })
  it('忽略预告、无播放地址与重复集数，保留真实播放索引', () => {
    expect(
      playableEpisodes({
        success: true,
        episodes: ['https://x/preview', 'https://x/1', '', 'https://x/3', 'https://x/3b'],
        videoInfo: {
          title: '剧',
          episodes_names: ['预告', '第01集', '第02集', '第03集', '第03集'],
        },
      }),
    ).toEqual([
      { index: 1, number: 1 },
      { index: 3, number: 3 },
    ])
  })

  it('看到第9集且已看完时，还剩3集；刚开始第10集不消除该集提醒', () => {
    const progress = trackingProgress(cms, update, [
      record(),
      record({ episodeIndex: 9, episodeName: '第10集', playbackPosition: 0 }),
    ])
    expect(progress).toMatchObject({
      currentEpisode: 9,
      pendingCount: 3,
      nextEpisode: { index: 9, number: 10 },
    })
    expect(trackingProgress(cms, update, [record({ playbackPosition: 40 })]).pendingCount).toBe(4)
  })

  it('不同季、不同剧的历史不会抵消本季待看数', () => {
    const unrelated = [
      record({ recordType: 'tmdb', tmdbMediaType: 'tv', tmdbId: 1, tmdbSeasonNumber: 1 }),
      record({ recordType: 'tmdb', tmdbMediaType: 'tv', tmdbId: 99, tmdbSeasonNumber: 2 }),
    ]
    expect(trackingProgress(tv, update, unrelated).pendingCount).toBe(12)
    expect(
      trackingProgress(tv, update, [
        record({ recordType: 'tmdb', tmdbMediaType: 'tv', tmdbId: 1, tmdbSeasonNumber: 2 }),
      ]).pendingCount,
    ).toBe(3)
  })

  it('缺集时按实际可看集数计算，清空历史后回到尚未观看', () => {
    const sparse = {
      ...update,
      episodes: [
        { index: 0, number: 1 },
        { index: 1, number: 3 },
      ],
    }
    expect(trackingProgress(cms, sparse, [record({ episodeName: '第1集' })]).pendingCount).toBe(1)
    expect(trackingProgress(cms, sparse, []).pendingCount).toBe(2)
  })

  it('直接进入可播放资源并携带正确的季与播放索引', () => {
    expect(trackingPlayPath(tv, update, 9)).toBe('/play/tv/1?source=s&id=a&ep=9&season=2')
    expect(trackingPlayPath(cms, update, 9)).toBe('/play/cms/s/a?ep=9')
  })
})

describe('视频源实际更新检查', () => {
  it('旧收藏中的数字ID在详情请求和检查结果中统一为字符串', async () => {
    const numeric = { ...cms, media: { ...cms.media, vodId: 83519 } } as unknown as CmsFavoriteItem
    const client = { search: vi.fn(), getDetail: vi.fn().mockResolvedValue(detail) }
    const result = await checkSeriesUpdates(
      numeric,
      client,
      [source],
      [],
      new AbortController().signal,
    )
    expect(client.getDetail).toHaveBeenCalledWith('83519', source)
    expect(result.vodId).toBe('83519')
  })

  it.each([cms, tv])('手动绑定优先于原源、历史和自动搜索：$sourceType', async item => {
    const fixed = {
      sourceCode: 'fixed',
      sourceName: '固定源',
      vodId: 'manual',
      title: '手动选择的版本',
    }
    const key = item.sourceType === 'cms' ? 'cms' : '2'
    const client = { search: vi.fn(), getDetail: vi.fn().mockResolvedValue(detail) }
    const selectedSource = { ...source, id: 'fixed' }
    const result = await checkSeriesUpdates(
      { ...item, tracking: { ...item.tracking!, bindings: { [key]: fixed } } },
      client,
      [source, selectedSource],
      [record()],
      new AbortController().signal,
    )
    expect(result.vodId).toBe('manual')
    expect(client.getDetail).toHaveBeenCalledTimes(1)
    expect(client.getDetail).toHaveBeenCalledWith('manual', selectedSource)
    expect(client.search).not.toHaveBeenCalled()
  })

  it('绑定源失效时明确报错，不静默回退到其他资源', async () => {
    const item = {
      ...cms,
      tracking: {
        enabled: true,
        bindings: {
          cms: {
            sourceCode: 'fixed',
            sourceName: '固定源',
            vodId: 'manual',
            title: '剧',
          },
        },
      },
    }
    const client = {
      search: vi.fn(),
      getDetail: vi
        .fn()
        .mockResolvedValue({ success: false, episodes: [], error: '固定资源已下架' }),
    }
    await expect(
      checkSeriesUpdates(item, client, [source], [], new AbortController().signal),
    ).rejects.toThrow('绑定的视频源未启用')
    expect(client.getDetail).not.toHaveBeenCalled()
    await expect(
      checkSeriesUpdates(
        item,
        client,
        [{ ...source, id: 'fixed' }, source],
        [],
        new AbortController().signal,
      ),
    ).rejects.toThrow('已下架')
    expect(client.getDetail).toHaveBeenCalledTimes(1)
    expect(client.search).not.toHaveBeenCalled()
  })

  it('CMS 收藏直接读取原源详情，不采用 TMDB 或备注中的计划集数', async () => {
    const client = { search: vi.fn(), getDetail: vi.fn().mockResolvedValue(detail) }
    const result = await checkSeriesUpdates(cms, client, [source], [], new AbortController().signal)
    expect(client.search).not.toHaveBeenCalled()
    expect(result.episodes).toHaveLength(2)
    expect(result.sourceCode).toBe('s')
  })

  it('源被禁用或详情失败时明确报错，不返回零集成功结果', async () => {
    const client = {
      search: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({ success: false, episodes: [], error: '超时' }),
    }
    await expect(
      checkSeriesUpdates(cms, client, [], [], new AbortController().signal),
    ).rejects.toThrow('未启用')
    await expect(
      checkSeriesUpdates(cms, client, [source], [], new AbortController().signal),
    ).rejects.toThrow('超时')
  })

  it.each([2, 100])('TMDB 第 %i 季匹配拒绝相似标题与其他季', async seasonNumber => {
    const client = {
      search: vi.fn().mockResolvedValue({
        success: true,
        items: [
          { vod_id: 'wrong-title', vod_name: `测试剧外传第${seasonNumber}季` },
          { vod_id: 'wrong-season', vod_name: '测试剧第1季' },
          { vod_id: 'correct', vod_name: `测试剧第${seasonNumber}季` },
        ],
      }),
      getDetail: vi.fn().mockResolvedValue(detail),
    }
    const result = await checkSeriesUpdates(
      { ...tv, tracking: { enabled: true, seasonNumber } },
      client,
      [source],
      [],
      new AbortController().signal,
    )
    expect(client.getDetail).toHaveBeenCalledTimes(1)
    expect(client.getDetail).toHaveBeenCalledWith('correct', source)
    expect(result.episodes).toHaveLength(2)
  })

  it('优先沿用同季观看记录绑定的资源，其他季记录不能绑定', async () => {
    const client = { search: vi.fn(), getDetail: vi.fn().mockResolvedValue(detail) }
    await checkSeriesUpdates(
      tv,
      client,
      [source],
      [
        record({
          recordType: 'tmdb',
          tmdbMediaType: 'tv',
          tmdbId: 1,
          tmdbSeasonNumber: 1,
          vodId: 'season-1',
          timestamp: 9,
        }),
        record({
          recordType: 'tmdb',
          tmdbMediaType: 'tv',
          tmdbId: 1,
          tmdbSeasonNumber: 2,
          vodId: 'season-2',
        }),
      ],
      new AbortController().signal,
    )
    expect(client.getDetail).toHaveBeenCalledTimes(1)
    expect(client.getDetail).toHaveBeenCalledWith('season-2', source)
    expect(client.search).not.toHaveBeenCalled()
  })

  it('资源下架和预告片不算更新；取消检查后不继续发起请求', async () => {
    const client = {
      search: vi.fn(),
      getDetail: vi
        .fn()
        .mockResolvedValue({ success: true, episodes: [], videoInfo: { title: '预告' } }),
    }
    await expect(
      checkSeriesUpdates(cms, client, [source], [], new AbortController().signal),
    ).rejects.toThrow('正片')
    client.getDetail.mockClear()
    const controller = new AbortController()
    controller.abort()
    await expect(checkSeriesUpdates(cms, client, [source], [], controller.signal)).rejects.toThrow()
    expect(client.getDetail).not.toHaveBeenCalled()
  })
})
