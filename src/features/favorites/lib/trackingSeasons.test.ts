import { describe, expect, it } from 'vitest'
import {
  normalizeTrackingSeasons,
  nextAiredSeason,
  canDiscoverNextSeason,
  type TrackingSeason,
} from './trackingSeasons'
import { FavoriteWatchStatus, type TmdbFavoriteItem } from '../types/favorites'
import type { SeriesUpdate } from './seriesTracking'

const now = new Date(2026, 9, 19, 0, 10).getTime()
const season = (
  number: number,
  airDate: string | null = '2026-10-18',
  episodeCount = 2,
): TrackingSeason => ({
  number,
  name: `季 ${number}`,
  airDate,
  episodeCount,
})

describe('新季发现', () => {
  it('保留真实季元数据、排序去重并排除特别篇和无效季号，不限制99季', () => {
    expect(
      normalizeTrackingSeasons([
        { season_number: 0, name: '特别篇' },
        { season_number: -1 },
        { season_number: 1.5 },
        { season_number: Number.MAX_SAFE_INTEGER + 1 },
        { season_number: 100, name: '  百季  ', air_date: '2026-10-18', episode_count: 10 },
        { season_number: 2, name: '初始名' },
        { season_number: 1, name: ' ', air_date: '', episode_count: -2 },
        { season_number: 2, name: '更新名', air_date: '2026-10-19', episode_count: 3 },
      ]),
    ).toEqual([
      { number: 1, name: '第 1 季', airDate: null, episodeCount: 0 },
      { number: 2, name: '更新名', airDate: '2026-10-19', episodeCount: 3 },
      { number: 100, name: '百季', airDate: '2026-10-18', episodeCount: 10 },
    ])
  })

  it('从真实列表中选择最近一个已开播后续季，不假定季号连续', () => {
    expect(
      nextAiredSeason([season(5), season(1), season(3), season(2, '2026-10-20')], 1, now)?.number,
    ).toBe(3)
    expect(nextAiredSeason([season(100)], 99, now)?.number).toBe(100)
    expect(nextAiredSeason([season(1), season(2)], 2, now)).toBeUndefined()
  })

  it.each([
    season(0),
    season(1),
    season(2, '2026-10-20'),
    season(2, null),
    season(2, ''),
    season(2, '2026-02-30'),
    season(2, '2026-13-01'),
    season(2, '2026-1-1'),
    season(2, '2026-10-18', 0),
    season(2, '2026-10-18', -1),
    season(2, '2026-10-18', 1.5),
  ])('不把特别篇、未来季、未知日期、错误日期或空季判为已开播：%j', invalid => {
    expect(nextAiredSeason([invalid], 1, now)).toBeUndefined()
  })

  it('按本地日期比较，首播当天可提醒，次日不提前提醒', () => {
    expect(nextAiredSeason([season(2, '2026-10-19')], 1, now)?.number).toBe(2)
    expect(nextAiredSeason([season(2, '2026-10-20')], 1, now)).toBeUndefined()
  })

  it('只有当前季追平且源可用才发现新季，未知、失败和旧绑定结果不能触发', () => {
    const item: TmdbFavoriteItem = {
      id: 'tmdb_tv_1',
      sourceType: 'tmdb',
      addedAt: 1,
      updatedAt: 1,
      tags: [],
      watchStatus: FavoriteWatchStatus.WATCHING,
      media: {
        id: 1,
        mediaType: 'tv',
        title: '测试剧',
        originalTitle: '',
        posterPath: null,
        backdropPath: null,
        releaseDate: '',
        voteAverage: 0,
      },
      tracking: {
        enabled: true,
        seasonNumber: 1,
        progress: { '1': { completedEpisode: 2, calibratedAt: 1 } },
      },
    }
    const update: SeriesUpdate = {
      checkedAt: 2,
      attemptedAt: 2,
      sourceCode: 's',
      vodId: 'a',
      episodes: [
        { index: 0, number: 1 },
        { index: 1, number: 2 },
      ],
    }
    expect(canDiscoverNextSeason(item, update, [], ['s'])).toBe(true)
    expect(canDiscoverNextSeason(item, undefined, [], ['s'])).toBe(false)
    expect(canDiscoverNextSeason(item, { ...update, error: 'offline' }, [], ['s'])).toBe(false)
    expect(canDiscoverNextSeason(item, { ...update, episodes: [] }, [], ['s'])).toBe(false)
    expect(canDiscoverNextSeason(item, { ...update, bindingKey: 'old-binding' }, [], ['s'])).toBe(
      false,
    )
    expect(canDiscoverNextSeason(item, update, [], [])).toBe(false)
    expect(
      canDiscoverNextSeason({ ...item, tracking: { enabled: false } }, update, [], ['s']),
    ).toBe(false)
    expect(
      canDiscoverNextSeason(
        {
          ...item,
          tracking: {
            enabled: true,
            seasonNumber: 1,
            progress: { '2': { completedEpisode: 2, calibratedAt: 1 } },
          },
        },
        update,
        [],
        ['s'],
      ),
    ).toBe(false)
    expect(
      canDiscoverNextSeason(
        { ...item, media: { ...item.media, mediaType: 'movie' } },
        update,
        [],
        ['s'],
      ),
    ).toBe(false)
  })
})
