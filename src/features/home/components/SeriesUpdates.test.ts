import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SeriesUpdates } from './SeriesUpdates'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import { useFavoritesStore } from '@/features/favorites/store/favoritesStore'
import { useSeriesUpdatesStore } from '@/features/favorites/store/seriesUpdatesStore'
import { FavoriteWatchStatus, type CmsFavoriteItem } from '@/features/favorites/types/favorites'
import { trackingKey, type SeriesUpdate } from '@/features/favorites/lib/seriesTracking'
import { useApiStore } from '@/shared/store/apiStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { accountSchema } from '../../../../shared/account-rules'

const ownerId = '00000000-0000-4000-8000-000000000001'
const account = (id: string) =>
  accountSchema.parse({
    id,
    username: 'test',
    role: 'user',
    enabled: true,
    created_at: '2026-10-19',
  })
function favorite(id: string, title: string, completed = 0, source = 's'): CmsFavoriteItem {
  return {
    id,
    sourceType: 'cms',
    addedAt: 1,
    updatedAt: 1,
    watchStatus: FavoriteWatchStatus.WATCHING,
    tags: [],
    media: { vodId: id, vodName: title, sourceCode: source, sourceName: '测试源' },
    tracking: {
      enabled: true,
      progress: { cms: { completedEpisode: completed, calibratedAt: 1 } },
    },
  }
}
function result(item: CmsFavoriteItem, count: number): SeriesUpdate {
  return {
    sourceCode: item.media.sourceCode,
    sourceName: item.media.sourceName,
    vodId: item.media.vodId,
    checkedAt: 2,
    attemptedAt: 2,
    episodes: Array.from({ length: count }, (_, index) => ({ index, number: index + 1 })),
    notification: {
      knownEpisodes: Array.from({ length: count }, (_, index) => index + 1),
      unreadEpisodes: [],
    },
  }
}

let host: HTMLDivElement
let root: Root
let favorites: CmsFavoriteItem[]
const titles = () => Array.from(host.querySelectorAll('article h3')).map(node => node.textContent)
const filterButton = (label: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>('[aria-label="追更筛选"] button')).find(
    button => button.textContent?.startsWith(label),
  )!
const chooseFilter = (label: string) => act(async () => filterButton(label).click())
const mount = () =>
  act(async () => root.render(createElement(MemoryRouter, null, createElement(SeriesUpdates))))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  favorites = [
    favorite('new', '新集剧', 1),
    favorite('pending', '待看剧'),
    favorite('caught', '追平剧', 2),
    favorite('failed', '失败剧', 1),
    favorite('unknown', '未检查剧'),
    favorite('disabled', '停用源剧', 1, 'off'),
  ]
  useFavoritesStore.setState({ favorites, filteredFavorites: favorites })
  useAuthStore.setState({ account: account(ownerId) })
  useViewingHistoryStore.setState({ viewingHistory: [] })
  useSettingStore.getState().setSystemSettings({ tmdbEnabled: true })
  useApiStore.setState({
    videoAPIs: [
      { id: 's', name: '测试源', url: 'https://s/api', isEnabled: true },
      { id: 'off', name: '停用源', url: 'https://off/api', isEnabled: false },
    ],
  })
  const entries = Object.fromEntries(
    favorites
      .filter(item => item.id !== 'unknown')
      .map(item => [
        trackingKey(item),
        result(item, ['new', 'caught'].includes(item.id) ? 2 : item.id === 'pending' ? 3 : 1),
      ]),
  )
  entries[trackingKey(favorites[0])].notification!.unreadEpisodes = [2]
  entries[trackingKey(favorites[3])].error = '网络错误'
  useSeriesUpdatesStore.setState({
    ownerId,
    entries,
    checking: false,
    checkingKeys: [],
    checkProgress: null,
    activeKeys: favorites.map(trackingKey),
    refreshToken: 0,
    refreshTarget: null,
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('首页追更筛选', () => {
  it('显示全队列进度和失败数量，筛选不改变进度，切账号后隐藏旧摘要', async () => {
    useSeriesUpdatesStore.setState({
      checking: true,
      checkProgress: { total: 6, completed: 4, failed: 1, cached: 2 },
    })
    await mount()
    expect(host.querySelector('[aria-label="追更检查进度"]')?.textContent).toContain(
      '已检查 4 / 6 部',
    )
    expect(host.querySelector('[aria-label="追更检查进度"]')?.textContent).toContain('失败 1 部')
    expect(host.querySelector('[aria-label="追更检查进度"]')?.textContent).toContain(
      '复用 2 部缓存',
    )
    await chooseFilter('有新集')
    expect(titles()).toEqual(['新集剧'])
    const bar = host.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('4')
    expect(bar.getAttribute('aria-valuemax')).toBe('6')
    expect(bar.getAttribute('aria-valuetext')).toContain('失败 1 部')
    await act(async () =>
      useAuthStore.setState({ account: account('00000000-0000-4000-8000-000000000002') }),
    )
    expect(host.querySelector('[aria-label="追更检查进度"]')).toBeNull()
  })

  it('显示各类数量，可独立筛选新集、待看、追平和异常', async () => {
    await mount()
    expect(titles()).toHaveLength(6)
    expect(filterButton('全部').textContent).toBe('全部6')
    expect(filterButton('有新集').textContent).toBe('有新集1')
    expect(filterButton('待看').textContent).toBe('待看2')
    expect(filterButton('已追平').textContent).toBe('已追平1')
    expect(filterButton('检查异常').textContent).toBe('检查异常2')
    await chooseFilter('有新集')
    expect(titles()).toEqual(['新集剧'])
    expect(filterButton('有新集').getAttribute('aria-pressed')).toBe('true')
    expect(filterButton('全部').getAttribute('aria-pressed')).toBe('false')
    await chooseFilter('待看')
    expect(titles()).toEqual(['新集剧', '待看剧'])
    await chooseFilter('已追平')
    expect(titles()).toEqual(['追平剧'])
    await chooseFilter('检查异常')
    expect(titles()).toEqual(['失败剧', '停用源剧'])
    expect(host.textContent).toContain('网络错误')
    expect(host.textContent).toContain('上次检查的视频源已停用')
  })

  it('标记已读后新集筛选变为空状态，可返回全部且待看进度不变', async () => {
    await mount()
    await chooseFilter('有新集')
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="标记新集剧更新提醒为已读"]')!.click(),
    )
    expect(titles()).toEqual([])
    expect(host.textContent).toContain('暂无新集提醒')
    expect(filterButton('有新集').textContent).toBe('有新集0')
    expect(filterButton('待看').textContent).toBe('待看2')
    const back = Array.from(host.querySelectorAll('button')).find(
      button => button.textContent === '查看全部追更',
    )!
    await act(async () => back.click())
    expect(titles()).toHaveLength(6)
    expect(filterButton('全部').getAttribute('aria-pressed')).toBe('true')
  })

  it('校准进度后当前筛选与计数立即变化，不触发更新检查', async () => {
    await mount()
    await chooseFilter('待看')
    await act(async () => {
      useFavoritesStore.getState().setTrackingProgress('pending', 3, 'cms')
    })
    expect(titles()).toEqual(['新集剧'])
    expect(filterButton('待看').textContent).toBe('待看1')
    expect(filterButton('已追平').textContent).toBe('已追平2')
    await chooseFilter('已追平')
    expect(titles()).toEqual(['待看剧', '追平剧'])
    expect(useSeriesUpdatesStore.getState().refreshToken).toBe(0)
  })

  it('无结果、空播放列表、旧绑定和检查失败都不会误算为已追平', async () => {
    const emptyItem = favorite('empty', '空列表剧')
    const boundItem = favorite('bound', '旧绑定剧', 2)
    boundItem.tracking!.bindings = {
      cms: { sourceCode: 's', sourceName: '测试源', vodId: 'new-binding', title: '新绑定资源' },
    }
    useFavoritesStore.setState({ favorites: [...favorites, emptyItem, boundItem] })
    useSeriesUpdatesStore.setState(state => ({
      entries: {
        ...state.entries,
        [trackingKey(emptyItem)]: result(emptyItem, 0),
        [trackingKey(boundItem)]: result(boundItem, 2),
      },
    }))
    await mount()
    await chooseFilter('已追平')
    expect(titles()).toEqual(['追平剧'])
    await chooseFilter('全部')
    expect(titles()).toContain('空列表剧')
    expect(titles()).toContain('旧绑定剧')
    expect(titles()).toContain('未检查剧')
  })

  it('源停用后移入异常筛选，恢复启用后重新显示已追平', async () => {
    await mount()
    await chooseFilter('已追平')
    await act(async () =>
      useApiStore.setState(state => ({
        videoAPIs: state.videoAPIs.map(source => ({ ...source, isEnabled: false })),
      })),
    )
    expect(titles()).toEqual([])
    expect(host.textContent).toContain('还没有已追平的剧集')
    await chooseFilter('检查异常')
    expect(titles()).toContain('追平剧')
    await act(async () =>
      useApiStore.setState(state => ({
        videoAPIs: state.videoAPIs.map(source => ({ ...source, isEnabled: source.id === 's' })),
      })),
    )
    expect(titles()).not.toContain('追平剧')
    await chooseFilter('已追平')
    expect(titles()).toEqual(['追平剧'])
  })

  it('切换账号时重置为全部，不使用前一账号的缓存计算状态', async () => {
    await mount()
    await chooseFilter('有新集')
    await act(async () =>
      useAuthStore.setState({ account: account('00000000-0000-4000-8000-000000000002') }),
    )
    expect(filterButton('全部').getAttribute('aria-pressed')).toBe('true')
    expect(titles()).toHaveLength(6)
    expect(filterButton('有新集').textContent).toBe('有新集0')
    expect(filterButton('已追平').textContent).toBe('已追平0')
    expect(filterButton('检查异常').textContent).toBe('检查异常0')
  })

  it('关闭全部追更后隐藏整个组件', async () => {
    await mount()
    await chooseFilter('待看')
    await act(async () => {
      favorites.forEach(item =>
        useFavoritesStore.getState().setTracking(item.id, { enabled: false }),
      )
    })
    expect(host.querySelector('[aria-label="追剧更新"]')).toBeNull()
  })
})


it('切换无痕时隐藏并恢复追剧，不改变收藏', async () => {
  await mount()
  expect(host.querySelector('[aria-label="追剧更新"]')).not.toBeNull()
  const before = JSON.stringify(useFavoritesStore.getState().favorites)
  await act(async () => usePrivateModeStore.getState().setPrivateMode(true))
  expect(host.querySelector('[aria-label="追剧更新"]')).toBeNull()
  await act(async () => usePrivateModeStore.getState().setPrivateMode(false))
  expect(host.querySelector('[aria-label="追剧更新"]')).not.toBeNull()
  expect(JSON.stringify(useFavoritesStore.getState().favorites)).toBe(before)
})
