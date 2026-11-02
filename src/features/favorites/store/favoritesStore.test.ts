import { beforeEach, describe, expect, it } from 'vitest'
import type { VideoItem } from '@/shared/types/video'
import { useFavoritesStore } from './favoritesStore'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'

const DEFAULT_FILTER_OPTIONS = {
  sourceType: 'all',
  watchStatus: 'all',
  sortBy: 'addedAt',
  sortOrder: 'desc',
} as const

function createCmsVideo(overrides: Partial<VideoItem> = {}): VideoItem {
  return {
    vod_id: 'vod-1',
    vod_name: '测试视频',
    source_code: 'source-a',
    source_name: '测试源',
    ...overrides,
  }
}

describe('favoritesStore cms id encoding', () => {
  beforeEach(() => {
    localStorage.removeItem('xkatv-favorites-store')
    useFavoritesStore.persist.clearStorage()
    useFavoritesStore.setState({
      favorites: [],
      filteredFavorites: [],
      filterOptions: { ...DEFAULT_FILTER_OPTIONS },
      selectedIds: new Set<string>(),
    })
  })

  it('addCmsFavorite 支持中文 sourceCode 和 vodId', () => {
    const video = createCmsVideo({
      vod_id: '第壹集-中文ID',
      source_code: '源站A-中文',
    })

    expect(() => useFavoritesStore.getState().addCmsFavorite(video)).not.toThrow()
    expect(useFavoritesStore.getState().isCmsFavorited(video.vod_id, video.source_code || '')).toBe(true)

    const favorite = useFavoritesStore.getState().getCmsFavorite(video.vod_id, video.source_code || '')
    expect(favorite).toBeDefined()
    expect(favorite?.media.vodId).toBe(video.vod_id)
    expect(favorite?.media.sourceCode).toBe(video.source_code)
  })

  it('toggleCmsFavorite 在中文 ID 下可正确添加与移除', () => {
    const video = createCmsVideo({
      vod_id: '中文-可切换',
      source_code: '直连-中文源',
    })

    useFavoritesStore.getState().toggleCmsFavorite(video)
    expect(useFavoritesStore.getState().favorites).toHaveLength(1)
    expect(useFavoritesStore.getState().isCmsFavorited(video.vod_id, video.source_code || '')).toBe(true)

    useFavoritesStore.getState().toggleCmsFavorite(video)
    expect(useFavoritesStore.getState().favorites).toHaveLength(0)
    expect(useFavoritesStore.getState().isCmsFavorited(video.vod_id, video.source_code || '')).toBe(false)
  })

  it('ASCII 输入与旧 btoa 结果保持一致', () => {
    const sourceCode = 'source-en'
    const vodId = 'vod-abc-123'
    const video = createCmsVideo({
      vod_id: vodId,
      source_code: sourceCode,
    })

    useFavoritesStore.getState().addCmsFavorite(video)
    const favorite = useFavoritesStore.getState().favorites[0]
    const legacyId = `cms_${btoa(`${sourceCode}::${vodId}`)}`

    expect(favorite?.id).toBe(legacyId)
  })

  it('视频源返回数字绑定ID时保存字符串，非法数字不会替换已有绑定', () => {
    const store = useFavoritesStore.getState()
    store.addCmsFavorite(createCmsVideo())
    const id = useFavoritesStore.getState().favorites[0].id
    store.setTracking(id, { enabled: true })
    const binding = {
      sourceCode: 's', sourceName: 'S', title: '视频源资源',
      // CMS responses can contain numbers despite the public string-ID interface.
      vodId: 12345 as unknown as string,
    }
    expect(store.setTrackingBinding(id, binding, 'cms', 3)).toBe(true)
    const tracking = useFavoritesStore.getState().favorites[0].tracking
    expect(tracking?.bindings?.cms.vodId).toBe('12345')
    expect(tracking?.progress?.cms.completedEpisode).toBe(3)
    expect(store.setTrackingBinding(id, { ...binding, vodId: 1.5 as unknown as string }, 'cms', 4)).toBe(false)
    expect(useFavoritesStore.getState().favorites[0].tracking).toEqual(tracking)
  })

  it('addFavorites 在中文 CMS 条目下可去重', () => {
    const video = createCmsVideo({
      vod_id: '中文-去重',
      source_code: '中文-源',
    })

    useFavoritesStore.getState().addFavorites([video, { ...video }])
    expect(useFavoritesStore.getState().favorites).toHaveLength(1)
  })

  it('保存校准并持久化，恢复自动计算时保留观看历史', () => {
    const store = useFavoritesStore.getState()
    store.addCmsFavorite(createCmsVideo())
    const id = useFavoritesStore.getState().favorites[0].id
    store.setTracking(id, { enabled: true })
    const history = useViewingHistoryStore.getState().viewingHistory
    expect(store.setTrackingProgress(id, 9, 'cms')).toBe(true)
    expect(useFavoritesStore.getState().filteredFavorites[0].tracking?.progress?.cms.completedEpisode).toBe(9)
    expect(localStorage.getItem('xkatv-favorites-store')).toContain('completedEpisode')
    store.setTracking(id, { enabled: false })
    store.setTracking(id, { enabled: true })
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress?.cms.completedEpisode).toBe(9)
    expect(store.setTrackingProgress(id, null, 'cms')).toBe(true)
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress).toBeUndefined()
    expect(useViewingHistoryStore.getState().viewingHistory).toBe(history)
  })

  it('拒绝非法值、过期季数与已取消追更的提交', () => {
    const store = useFavoritesStore.getState()
    store.addCmsFavorite(createCmsVideo())
    const id = useFavoritesStore.getState().favorites[0].id
    store.setTracking(id, { enabled: true })
    for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(store.setTrackingProgress(id, value, 'cms')).toBe(false)
    }
    expect(store.setTrackingProgress(id, 9, '2')).toBe(false)
    expect(store.setTrackingProgress(id, 0, 'cms')).toBe(true)
    store.setTracking(id, { enabled: false })
    expect(store.setTrackingProgress(id, 9, 'cms')).toBe(false)
  })
  it('绑定与恢复原源保留已看集数，并拒绝过期季数与非法资源', () => {
    const store = useFavoritesStore.getState()
    store.addCmsFavorite(createCmsVideo())
    const id = useFavoritesStore.getState().favorites[0].id
    store.setTracking(id, { enabled: true })
    const binding = { sourceCode: 's2', sourceName: '源2', vodId: 'b', title: '新版' }
    expect(store.setTrackingBinding(id, binding, '2', 9)).toBe(false)
    expect(store.setTrackingBinding(id, { ...binding, vodId: 'https://x/a' }, 'cms', 9)).toBe(false)
    expect(store.setTrackingBinding(id, binding, 'cms', 9)).toBe(true)
    expect(useFavoritesStore.getState().favorites[0].tracking?.bindings?.cms).toEqual(binding)
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress?.cms.completedEpisode).toBe(9)
    store.setTracking(id, { enabled: false })
    store.setTracking(id, { enabled: true })
    expect(useFavoritesStore.getState().favorites[0].tracking?.bindings?.cms).toEqual(binding)
    expect(store.setTrackingBinding(id, null, 'cms', 10)).toBe(true)
    expect(useFavoritesStore.getState().favorites[0].tracking?.bindings).toBeUndefined()
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress?.cms.completedEpisode).toBe(10)
  })
})
