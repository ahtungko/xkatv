import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// @ts-expect-error react act environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import {
  usePrivateModeStore,
  resetPrivateModeStore,
  readPrivateModeSession,
  writePrivateModeSession,
} from './privateModeStore'
import { useViewingHistoryStore } from './viewingHistoryStore'
import { useSearchStore } from './searchStore'
import { useTmdbMatchCacheStore } from './tmdbMatchCacheStore'
import { useSearchHistory } from '@/shared/hooks/useSearchHistory'
import { useSettingStore } from './settingStore'
import { useFavoritesStore } from '@/features/favorites/store/favoritesStore'

function renderHookHelper<T>(hook: () => T) {
  const result: { current: T } = {} as { current: T }
  function TestComponent() {
    result.current = hook()
    return null
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(createElement(TestComponent))
  })
  return {
    result,
    rerender() {
      act(() => {
        root.render(createElement(TestComponent))
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('usePrivateModeStore (无痕模式)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetPrivateModeStore()
    useViewingHistoryStore.setState({ viewingHistory: [] })
    useSearchStore.setState({ searchHistory: [] })
    useSettingStore.setState({
      playback: { ...useSettingStore.getState().playback, isViewingHistoryEnabled: true },
      search: { ...useSettingStore.getState().search, isSearchHistoryEnabled: true, isSearchHistoryVisible: true },
    })
  })

  it('默认为关闭状态，sessionStorage 为空', () => {
    expect(usePrivateModeStore.getState().isPrivateMode).toBe(false)
    expect(sessionStorage.getItem('xkatv-private-mode')).toBeNull()
  })

  it('setPrivateMode 可以开启和关闭无痕模式并同步 sessionStorage', () => {
    act(() => {
      usePrivateModeStore.getState().setPrivateMode(true)
    })
    expect(usePrivateModeStore.getState().isPrivateMode).toBe(true)
    expect(sessionStorage.getItem('xkatv-private-mode')).toBe('true')

    act(() => {
      usePrivateModeStore.getState().setPrivateMode(false)
    })
    expect(usePrivateModeStore.getState().isPrivateMode).toBe(false)
    expect(sessionStorage.getItem('xkatv-private-mode')).toBeNull()
  })

  it('togglePrivateMode 可以切换状态并返回最新的布尔值', () => {
    let next: boolean
    act(() => {
      next = usePrivateModeStore.getState().togglePrivateMode()
    })
    expect(next!).toBe(true)
    expect(usePrivateModeStore.getState().isPrivateMode).toBe(true)

    act(() => {
      next = usePrivateModeStore.getState().togglePrivateMode()
    })
    expect(next!).toBe(false)
    expect(usePrivateModeStore.getState().isPrivateMode).toBe(false)
  })

  it('当浏览器阻止 sessionStorage 时能优雅降级，不抛出异常', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied')
    })
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Access denied')
    })

    try {
      expect(readPrivateModeSession()).toBe(false)
      expect(() => writePrivateModeSession(true)).not.toThrow()
    } finally {
      getItemSpy.mockRestore()
      setItemSpy.mockRestore()
    }
  })

  it('无痕模式开启时，viewingHistoryStore 彻底阻断观影记录写入', () => {
    const sampleItem = {
      recordType: 'cms' as const,
      title: '测试无痕电影',
      imageUrl: '',
      sourceCode: 'test-source',
      sourceName: '测试源',
      vodId: '12345',
      episodeIndex: 0,
      episodeName: '正片',
      playbackPosition: 120,
      duration: 3600,
      timestamp: Date.now(),
    }

    // 1. 普通模式下正常记录
    useViewingHistoryStore.getState().addViewingHistory(sampleItem)
    expect(useViewingHistoryStore.getState().viewingHistory).toHaveLength(1)

    // 2. 开启无痕模式
    usePrivateModeStore.getState().setPrivateMode(true)

    // 尝试添加新视频
    useViewingHistoryStore.getState().addViewingHistory({
      ...sampleItem,
      vodId: '67890',
      title: '绝密视频',
    })

    // 记录数量仍为 1，绝密视频未被记录
    expect(useViewingHistoryStore.getState().viewingHistory).toHaveLength(1)
    expect(useViewingHistoryStore.getState().viewingHistory[0].vodId).toBe('12345')
  })

  it('无痕模式开启时，searchStore 阻断搜索关键词写入', () => {
    // 1. 普通模式下正常记录
    useSearchStore.getState().addSearchHistoryItem('星际穿越')
    expect(useSearchStore.getState().searchHistory).toHaveLength(1)

    // 2. 开启无痕模式
    usePrivateModeStore.getState().setPrivateMode(true)

    // 尝试记录新搜索
    useSearchStore.getState().addSearchHistoryItem('私密搜索词')
    expect(useSearchStore.getState().searchHistory).toHaveLength(1)
    expect(useSearchStore.getState().searchHistory[0].content).toBe('星际穿越')
  })

  it('无痕模式开启时，useSearchHistory hook 返回空历史，保护隐私', () => {
    useSearchStore.getState().addSearchHistoryItem('旧搜索词')
    const { result, rerender, unmount } = renderHookHelper(() => useSearchHistory())

    expect(result.current.searchHistory).toHaveLength(1)

    // 开启无痕模式
    act(() => {
      usePrivateModeStore.getState().setPrivateMode(true)
    })
    rerender()

    // 历史隐藏为空
    expect(result.current.searchHistory).toHaveLength(0)

    // 退出无痕模式
    act(() => {
      usePrivateModeStore.getState().setPrivateMode(false)
    })
    rerender()

    // 历史重现
    expect(result.current.searchHistory).toHaveLength(1)
    unmount()
  })

  it('无痕模式禁止修改原收藏、进度和历史', () => {
    useFavoritesStore.setState({ favorites: [], filteredFavorites: [] })
    useFavoritesStore.getState().addCmsFavorite({ vod_id: 'a', vod_name: '原收藏', source_code: 's', source_name: '源' })
    const id = useFavoritesStore.getState().favorites[0].id
    useFavoritesStore.getState().setTracking(id, { enabled: true })
    useSearchStore.getState().addSearchHistoryItem('原搜索')
    const before = JSON.stringify(useFavoritesStore.getState().favorites)
    usePrivateModeStore.getState().setPrivateMode(true)
    useFavoritesStore.getState().removeFavorites([id])
    useFavoritesStore.getState().clearFavorites()
    useFavoritesStore.getState().setNotes(id, 'private')
    useFavoritesStore.getState().setTracking(id, { enabled: false })
    expect(useFavoritesStore.getState().setTrackingProgress(id, 3, 'cms')).toBe(false)
    useSearchStore.getState().clearSearchHistory()
    expect(JSON.stringify(useFavoritesStore.getState().favorites)).toBe(before)
    expect(useSearchStore.getState().searchHistory[0].content).toBe('原搜索')
    usePrivateModeStore.getState().setPrivateMode(false)
    expect(JSON.stringify(useFavoritesStore.getState().favorites)).toBe(before)
  })

  it('无痕期间不读取或保存影片匹配缓存', () => {
    const cache = useTmdbMatchCacheStore.getState()
    const payload = { searchedKeyword: '原记录', candidates: [], movieSourceMatches: [], seasonSourceMatches: [] }
    cache.setEntry('existing', payload)
    const before = localStorage.getItem('xkatv-tmdb-match-cache-store')
    usePrivateModeStore.getState().setPrivateMode(true)
    expect(cache.getEntry('existing', 24)).toBeNull()
    cache.setEntry('private', { ...payload, searchedKeyword: '私密' })
    expect(localStorage.getItem('xkatv-tmdb-match-cache-store')).toBe(before)
    usePrivateModeStore.getState().setPrivateMode(false)
    expect(cache.getEntry('existing', 24)?.payload.searchedKeyword).toBe('原记录')
    expect(cache.getEntry('private', 24)).toBeNull()
  })

  it('无痕模式开启时，favoritesStore 阻断添加和删除收藏', () => {
    useFavoritesStore.setState({ favorites: [], filteredFavorites: [] })

    // 1. 普通模式下正常添加
    useFavoritesStore.getState().addCmsFavorite({
      vod_id: 'fav-1',
      vod_name: '收藏测试',
      source_code: 'src',
      source_name: '源',
    })
    expect(useFavoritesStore.getState().favorites).toHaveLength(1)

    // 2. 开启无痕模式
    usePrivateModeStore.getState().setPrivateMode(true)

    // 尝试添加新收藏
    useFavoritesStore.getState().addCmsFavorite({
      vod_id: 'fav-2',
      vod_name: '无痕尝试收藏',
      source_code: 'src',
      source_name: '源',
    })
    expect(useFavoritesStore.getState().favorites).toHaveLength(1)

    // 尝试删除已有收藏
    useFavoritesStore.getState().removeFavorite(useFavoritesStore.getState().favorites[0].id)
    expect(useFavoritesStore.getState().favorites).toHaveLength(1)
  })
})
