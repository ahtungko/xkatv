import { describe, expect, it } from 'vitest'
import { applyJournal, isDeprecatedPreference, normalizeFavoriteRecord, payloadErrorDetails, snapshot, validPayload } from './data'
import { useFavoritesStore } from '@/features/favorites/store/favoritesStore'
import type { SyncRecord } from './records'

function legacyTmdbFavorite(vodId: unknown = 12345): SyncRecord {
  return {
    kind: 'favorite', item_key: 'tmdb_tv_282326', modified_at: 123, mutation_id: 'legacy', deleted: false,
    value: {
      id: 'tmdb_tv_282326', addedAt: 1, updatedAt: 2, sourceType: 'tmdb',
      watchStatus: 'watching', notes: '保留备注', rating: 4, tags: ['追更'],
      tracking: { enabled: true, seasonNumber: 1,
        bindings: { '1': { sourceCode: 's', sourceName: 'S', vodId, title: '剧' } },
        progress: { '1': { completedEpisode: 12, calibratedAt: 100 } },
      },
      media: { id: 282326, mediaType: 'tv', title: '剧', originalTitle: 'Show',
        posterPath: null, backdropPath: null, releaseDate: '', voteAverage: 0 },
    },
  }
}

describe('cloud payload compatibility', () => {
  it('兼容数字追更绑定ID，实际写回收藏和快照时转为字符串且保留用户数据与记录时钟', () => {
    const row = legacyTmdbFavorite()
    expect(validPayload(row)).toBe(true)
    const repaired = normalizeFavoriteRecord(row)
    expect(repaired).toMatchObject({
      modified_at: 123, mutation_id: 'legacy',
      value: { notes: '保留备注', rating: 4, tags: ['追更'],
        tracking: { bindings: { '1': { vodId: '12345' } },
          progress: { '1': { completedEpisode: 12, calibratedAt: 100 } } },
      },
    })
    applyJournal({ favorite: { ...row, pending: false } })
    expect(useFavoritesStore.getState().favorites[0].tracking?.bindings?.['1'].vodId).toBe('12345')
    expect(Object.values(snapshot()).find(item => item.kind === 'favorite')?.value).toEqual(repaired.value)
    expect(row.value).toMatchObject({ tracking: { bindings: { '1': { vodId: 12345 } } } })
  })

  it.each([1.5, NaN, Infinity, false, {}, 'https://example.com/video'])('不会把非法绑定ID %s 强行转成字符串', vodId => {
    const row = legacyTmdbFavorite(vodId)
    expect(validPayload(row)).toBe(false)
    expect(normalizeFavoriteRecord(row)).toBe(row)
    expect(payloadErrorDetails(row)).toContain('tracking.bindings.1.vodId')
  })

  it('旧TMDB收藏缺少可选展示信息时补齐默认值，不猜测媒体身份或标题', () => {
    const row = legacyTmdbFavorite()
    const raw = row.value as Record<string, unknown>
    raw.media = { id: 282326, mediaType: 'tv', title: '剧', releaseDate: null, voteAverage: null }
    expect(validPayload(row)).toBe(true)
    expect(normalizeFavoriteRecord(row).value).toMatchObject({
      media: { originalTitle: '', posterPath: null, backdropPath: null, releaseDate: '', voteAverage: 0 },
    })
    raw.media = { id: 282326, mediaType: 'tv' }
    expect(validPayload(row)).toBe(false)
    expect(payloadErrorDetails(row)).toContain('media.title')
  })

  it('仍拒绝收藏标识不一致的数据，删除标记不尝试修复内容', () => {
    const row = legacyTmdbFavorite()
    expect(validPayload({ ...row, item_key: 'tmdb_tv_other' })).toBe(false)
    expect(payloadErrorDetails({ ...row, item_key: 'tmdb_tv_other' })).toContain('id 与记录标识不一致')
    const deleted = { ...row, deleted: true, value: null }
    expect(validPayload(deleted)).toBe(true)
    expect(normalizeFavoriteRecord(deleted)).toBe(deleted)
  })
  it('追更开关与季数可以跨设备同步，检查结果不混入收藏', () => {
    const row = {
      kind: 'favorite' as const, item_key: 'cms_x', modified_at: 1, mutation_id: 'b', deleted: false,
      value: { id: 'cms_x', addedAt: 1, updatedAt: 1, sourceType: 'cms', watchStatus: 'watching',
        tags: [], tracking: { enabled: true, seasonNumber: 2 },
        media: { vodId: 'x', vodName: 'X', sourceCode: 's', sourceName: 'S' } },
    }
    expect(validPayload(row)).toBe(true)
    expect(validPayload({ ...row, value: { ...row.value, tracking: { enabled: true, seasonNumber: 100 } } })).toBe(true)
    applyJournal({ favorite: { ...row, pending: false } })
    expect(useFavoritesStore.getState().favorites[0].tracking).toEqual({ enabled: true, seasonNumber: 2 })
    expect(validPayload({ ...row, value: { ...row.value, tracking: { enabled: true, seasonNumber: 0 } } })).toBe(false)
  })
  it('按季校准随收藏同步，兼容旧收藏并校验非法进度', () => {
    const row = {
      kind: 'favorite' as const, item_key: 'tmdb_tv_1', modified_at: 1, mutation_id: 'c', deleted: false,
      value: { id: 'tmdb_tv_1', addedAt: 1, updatedAt: 1, sourceType: 'tmdb', watchStatus: 'watching', tags: [],
        tracking: { enabled: true, seasonNumber: 2, progress: {
          '1': { completedEpisode: 12, calibratedAt: 100 }, '2': { completedEpisode: 0, calibratedAt: 200 },
        } }, media: { id: 1, mediaType: 'tv', title: '剧', originalTitle: 'Show', posterPath: null,
          backdropPath: null, releaseDate: '2024', voteAverage: 8 } },
    }
    expect(validPayload(row)).toBe(true)
    applyJournal({ favorite: { ...row, pending: false } })
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress).toEqual(row.value.tracking.progress)
    for (const progress of [{ '2': { completedEpisode: -1, calibratedAt: 1 } },
      { '2': { completedEpisode: 1.5, calibratedAt: 1 } }, { '0': { completedEpisode: 1, calibratedAt: 1 } }]) {
      expect(validPayload({ ...row, value: { ...row.value, tracking: { ...row.value.tracking, progress } } })).toBe(false)
    }
  })
  it('accepts nullable legacy favorite fields', () => {
    expect(
      validPayload({
        kind: 'favorite',
        item_key: 'cms_x',
        modified_at: 1,
        mutation_id: 'a',
        deleted: false,
        value: {
          id: 'cms_x',
          addedAt: 1,
          updatedAt: 1,
          sourceType: 'cms',
          watchStatus: 'watching',
          notes: null,
          rating: null,
          tags: [],
          media: { vodId: 'x', vodName: 'X', sourceCode: 's', sourceName: 'S', vodPic: null },
        },
      }),
    ).toBe(true)
  })
  it('追更绑定按季同步，资源地址不能充当视频ID', () => {
    const binding = { sourceCode: '源1', sourceName: '源名称', vodId: 'video-1', title: '手动绑定的剧' }
    const row = { kind: 'favorite' as const, item_key: 'cms_x', modified_at: 1, mutation_id: 'binding', deleted: false,
      value: { id: 'cms_x', addedAt: 1, updatedAt: 1, sourceType: 'cms', watchStatus: 'watching', tags: [],
        tracking: { enabled: true, bindings: { cms: binding } },
        media: { vodId: 'x', vodName: 'X', sourceCode: 's', sourceName: 'S' } } }
    expect(validPayload(row)).toBe(true)
    applyJournal({ favorite: { ...row, pending: false } })
    expect(useFavoritesStore.getState().favorites[0].tracking?.bindings?.cms).toEqual(binding)
    expect(validPayload({ ...row, value: { ...row.value, tracking: { enabled: true, bindings: { cms: { ...binding, vodId: 'https://x/v' } } } } })).toBe(false)
    expect(validPayload({ ...row, value: { ...row.value, tracking: { enabled: true, bindings: { '0': binding } } } })).toBe(false)
  })
  it('识别已下线的弹幕偏好配置为已废弃项', () => {
    expect(isDeprecatedPreference('playback.isDanmakuEnabled')).toBe(true)
    expect(isDeprecatedPreference('playback.danmakuOpacity')).toBe(true)
    expect(isDeprecatedPreference('playback.danmakuFontSize')).toBe(true)
    expect(isDeprecatedPreference('playback.danmakuSpeed')).toBe(true)
    expect(isDeprecatedPreference('playback.isDanmakuAntiOverlap')).toBe(true)
    expect(isDeprecatedPreference('playback.isAutoPlayEnabled')).toBe(false)
  })
});
