import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { DetailResult } from '@xkatv/cms-core'
import { useSeriesUpdateChecker } from './useSeriesUpdateChecker'
import { useFavoritesStore } from '../store/favoritesStore'
import { useSeriesUpdatesStore } from '../store/seriesUpdatesStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useApiStore } from '@/shared/store/apiStore'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { accountSchema } from '../../../../shared/account-rules'
import { TrackingControl } from '../components/TrackingControl'
import { SeriesUpdates } from '@/features/home/components/SeriesUpdates'
import { trackingBindingKey, trackingKey, unreadEpisodeNumbers } from '../lib/seriesTracking'
import { useSeriesNotificationsStore } from '../store/seriesNotificationsStore'

const mocks = vi.hoisted(() => {
  const tmdbDetails = vi.fn()
  return {
    getDetail: vi.fn(),
    search: vi.fn(),
    destroy: vi.fn(),
    tmdbDetails,
    tmdbClient: { tvShows: { details: tmdbDetails } },
  }
})
vi.mock('@/shared/lib/tmdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@/shared/lib/tmdb')>()),
  getTmdbClient: () => mocks.tmdbClient,
}))
vi.mock('@xkatv/cms-core', async importOriginal => ({
  ...(await importOriginal<typeof import('@xkatv/cms-core')>()),
  createCmsClient: () => mocks,
}))

const detail: DetailResult = {
  success: true,
  episodes: ['https://x/1', 'https://x/2'],
  videoInfo: { title: '测试剧', episodes_names: ['第01集', '第02集'] },
}

function setTmdbFavorite() {
  const item = useFavoritesStore.getState().favorites[0]
  useFavoritesStore.setState({
    favorites: [
      {
        ...item,
        sourceType: 'tmdb',
        id: 'tmdb_tv_1',
        media: {
          id: 1,
          mediaType: 'tv',
          title: '测试剧',
          originalTitle: 'Test Show',
          posterPath: '/poster.jpg',
          backdropPath: null,
          releaseDate: '2024-01-01',
          voteAverage: 8,
        },
      },
    ],
  })
}

let host: HTMLDivElement
let root: Root

function Harness() {
  useSeriesUpdateChecker()
  const item = useFavoritesStore(state => state.favorites[0])
  return createElement(
    MemoryRouter,
    null,
    createElement(SeriesUpdates),
    item && createElement(TrackingControl, { item }),
  )
}

function HomeHarness() {
  useSeriesUpdateChecker()
  return createElement(MemoryRouter, null, createElement(SeriesUpdates))
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  localStorage.clear()
  useSeriesNotificationsStore.setState({ accounts: {} })
  mocks.getDetail.mockReset().mockResolvedValue(detail)
  mocks.search.mockReset().mockResolvedValue({ success: true, items: [] })
  mocks.tmdbClient = { tvShows: { details: mocks.tmdbDetails } }
  mocks.tmdbDetails.mockReset().mockResolvedValue({
    seasons: [
      { season_number: 0, name: '特别篇' },
      { season_number: 1, name: '第 1 季' },
      { season_number: 2, name: '重逢篇' },
    ],
  })
  useSettingStore.getState().setSystemSettings({ tmdbEnabled: true })
  useFavoritesStore.setState({ favorites: [], filteredFavorites: [] })
  useFavoritesStore
    .getState()
    .addCmsFavorite({ vod_id: 'a', vod_name: '测试剧', source_code: 's', source_name: '源' })
  useSeriesUpdatesStore.setState({
    ownerId: null,
    entries: {},
    checking: false,
    checkingKeys: [],
    checkProgress: null,
    activeKeys: [],
    refreshToken: 0,
    refreshTarget: null,
  })
  useViewingHistoryStore.setState({ viewingHistory: [] })
  useApiStore.setState({
    videoAPIs: [{ id: 's', name: '源', url: 'https://x/api', isEnabled: true }],
  })
  useAuthStore.setState({
    account: accountSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      username: 'test',
      role: 'user',
      enabled: true,
      created_at: '2026-10-18',
    }),
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
const mount = () => act(async () => root.render(createElement(Harness)))
const mountHome = () => act(async () => root.render(createElement(HomeHarness)))
const bindTmdbSeason = (seasonNumber: number, vodId: string, completed: number) => {
  useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber })
  useFavoritesStore.getState().setTrackingBinding(
    'tmdb_tv_1',
    {
      sourceCode: 's',
      sourceName: '源',
      vodId,
      title: '测试剧',
    },
    String(seasonNumber),
    completed,
  )
}
const airedMetadata = {
  seasons: [
    { season_number: 0, name: '特别篇', air_date: '2020-01-01', episode_count: 1 },
    { season_number: 1, name: '第一季', air_date: '2024-01-01', episode_count: 2 },
    { season_number: 2, name: '重逢篇', air_date: '2025-01-01', episode_count: 2 },
  ],
}
const clickRefresh = async () => {
  const button = Array.from(host.querySelectorAll('button')).find(button =>
    button.textContent?.includes('检查更新'),
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
  await settle()
}

const openProgress = () =>
  act(async () => {
    host.querySelector<HTMLButtonElement>('[aria-label="校准测试剧观看进度"]')!.click()
  })
const setProgressInput = (value: string) =>
  act(async () => {
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
const progressButton = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
    button => button.textContent === text,
  )!
const clickProgressButton = (text: string) => act(async () => progressButton(text).click())
const openSource = () =>
  act(async () => host.querySelector<HTMLButtonElement>('[aria-label="绑定测试剧追更源"]')!.click())
const retry = (title = '测试剧') =>
  act(async () =>
    host.querySelector<HTMLButtonElement>(`[aria-label="重新检查${title}更新"]`)!.click(),
  )
const addTrackedShow = (vodId: string, title: string) => {
  useFavoritesStore
    .getState()
    .addCmsFavorite({ vod_id: vodId, vod_name: title, source_code: 's', source_name: '源' })
  const item = useFavoritesStore.getState().favorites[0]
  useFavoritesStore.getState().setTracking(item.id, { enabled: true })
  return item
}

describe('追更交互与后台检查', () => {
  it('视频源缺集时不提前建议跳季，确认看完TMDB已知集数后才提醒', async () => {
    setTmdbFavorite()
    bindTmdbSeason(1, 's1', 2)
    mocks.tmdbDetails.mockResolvedValue({
      seasons: airedMetadata.seasons.map(season =>
        season.season_number === 1 ? { ...season, episode_count: 3 } : season,
      ),
    })
    await mountHome()
    await settle()
    expect(host.querySelector('article')?.textContent).toContain('已追平')
    expect(host.querySelector('article')?.textContent).not.toContain('第 2 季已开播')
    await act(async () => useFavoritesStore.getState().setTrackingProgress('tmdb_tv_1', 3, '1'))
    expect(host.querySelector('article')?.textContent).toContain('第 2 季已开播')
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(1)
  })

  it('首页只在TMDB当前季追平后按需发现新季，回退进度后隐藏提醒', async () => {
    setTmdbFavorite()
    bindTmdbSeason(1, 's1', 0)
    mocks.tmdbDetails.mockResolvedValue(airedMetadata)
    await mountHome()
    await settle()
    expect(mocks.tmdbDetails).not.toHaveBeenCalled()
    expect(host.querySelector('article')?.textContent).not.toContain('已开播')
    await act(async () => useFavoritesStore.getState().setTrackingProgress('tmdb_tv_1', 1, '1'))
    expect(mocks.tmdbDetails).not.toHaveBeenCalled()
    await act(async () => useFavoritesStore.getState().setTrackingProgress('tmdb_tv_1', 2, '1'))
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(1)
    expect(host.querySelector('article')?.textContent).toContain('第 2 季已开播')
    expect(useFavoritesStore.getState().favorites[0].tracking?.seasonNumber).toBe(1)
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    await act(async () => useFavoritesStore.getState().setTrackingProgress('tmdb_tv_1', 0, '1'))
    expect(host.querySelector('[aria-label="测试剧新季提醒"]')).toBeNull()
  })

  it('首页与收藏共享新季元数据，一键切季保留各季进度和绑定并检查目标资源', async () => {
    setTmdbFavorite()
    bindTmdbSeason(3, 's3', 1)
    bindTmdbSeason(1, 's1', 2)
    mocks.tmdbDetails.mockResolvedValue({
      seasons: [
        ...airedMetadata.seasons.filter(season => season.season_number !== 2),
        { season_number: 2, name: '未来季', air_date: '2999-01-01', episode_count: 2 },
        { season_number: 3, name: '归来篇', air_date: '2025-01-01', episode_count: 2 },
      ],
    })
    await mount()
    await settle()
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(1)
    expect(host.querySelectorAll('[aria-label="切换测试剧追更至第3季"]')).toHaveLength(2)
    expect(host.querySelector('article')?.textContent).toContain('第 3 季已开播')
    const original = useFavoritesStore.getState().favorites[0].tracking!
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="切换测试剧追更至第3季"]')!.click(),
    )
    const switched = useFavoritesStore.getState().favorites[0].tracking!
    expect(switched.seasonNumber).toBe(3)
    expect(switched.progress).toEqual(original.progress)
    expect(switched.bindings).toEqual(original.bindings)
    expect(host.querySelector('[aria-label="切换测试剧追更至第3季"]')).toBeNull()
    await settle()
    expect(mocks.getDetail.mock.calls.map(call => call[0])).toEqual(['s1', 's3'])
    expect(host.querySelector('article')?.textContent).toContain('1 集待看')
    const playLink = Array.from(host.querySelectorAll<HTMLAnchorElement>('article a')).find(link =>
      link.textContent?.includes('继续观看'),
    )
    expect(playLink?.getAttribute('href')).toBe('/play/tv/1?source=s&id=s3&ep=1&season=3')
  })

  it('未知或未来季不提醒，可手动刷新新季元数据而不重复请求视频源', async () => {
    setTmdbFavorite()
    bindTmdbSeason(1, 's1', 2)
    mocks.tmdbDetails.mockResolvedValue({
      seasons: [
        airedMetadata.seasons[1],
        { season_number: 2, name: '未来季', air_date: '2999-01-01', episode_count: 2 },
        { season_number: 3, name: '待定季', air_date: null, episode_count: 3 },
        { season_number: 4, name: '空季', air_date: '2025-01-01', episode_count: 0 },
      ],
    })
    await mountHome()
    await settle()
    expect(host.querySelector('article')?.textContent).not.toContain('已开播')
    mocks.tmdbDetails.mockResolvedValue(airedMetadata)
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="检查测试剧新季"]')!.click(),
    )
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(2)
    expect(host.querySelector('article')?.textContent).toContain('第 2 季已开播')
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    expect(useFavoritesStore.getState().favorites[0].tracking?.seasonNumber).toBe(1)
  })

  it('新季元数据失败不影响已成功的剧集检查，支持单独重试', async () => {
    setTmdbFavorite()
    bindTmdbSeason(1, 's1', 2)
    mocks.tmdbDetails.mockRejectedValueOnce(new Error('TMDB offline'))
    await mountHome()
    await settle()
    expect(host.querySelector('article')?.textContent).toContain('暂时无法确认新季')
    expect(host.querySelector('article')?.textContent).toContain('已追平')
    expect(useSeriesUpdatesStore.getState().entries['tmdb_tv_1::1'].error).toBeUndefined()
    mocks.tmdbDetails.mockResolvedValue(airedMetadata)
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="检查测试剧新季"]')!.click(),
    )
    expect(host.querySelector('article')?.textContent).toContain('第 2 季已开播')
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
  })

  it('季元数据缓存到期后，成功检查当前季会重新发现已开播的新季', async () => {
    setTmdbFavorite()
    bindTmdbSeason(1, 's1', 2)
    mocks.tmdbDetails.mockResolvedValue({ seasons: [airedMetadata.seasons[1]] })
    await mountHome()
    await settle()
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(1)
    mocks.tmdbDetails.mockResolvedValue(airedMetadata)
    await retry()
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1))
    await retry()
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(2)
    expect(host.querySelector('article')?.textContent).toContain('第 2 季已开播')
  })

  it('点击前重新校验最新进度与账号，过期的新季入口不能改写追更季', async () => {
    setTmdbFavorite()
    bindTmdbSeason(1, 's1', 2)
    mocks.tmdbDetails.mockResolvedValue(airedMetadata)
    await mountHome()
    await settle()
    const oldButton = host.querySelector<HTMLButtonElement>('[aria-label="切换测试剧追更至第2季"]')!
    await act(async () => {
      useFavoritesStore.getState().setTrackingProgress('tmdb_tv_1', 0, '1')
      oldButton.click()
    })
    expect(useFavoritesStore.getState().favorites[0].tracking?.seasonNumber).toBe(1)
    await act(async () => useFavoritesStore.getState().setTrackingProgress('tmdb_tv_1', 2, '1'))
    const button = host.querySelector<HTMLButtonElement>('[aria-label="切换测试剧追更至第2季"]')!
    await act(async () => {
      useAuthStore.setState({
        account: {
          ...useAuthStore.getState().account!,
          id: '00000000-0000-4000-8000-000000000002',
        },
      })
      button.click()
    })
    expect(useFavoritesStore.getState().favorites[0].tracking?.seasonNumber).toBe(1)
  })

  it('CMS收藏不猜测季信息或请求TMDB，即使已经追平', async () => {
    const id = useFavoritesStore.getState().favorites[0].id
    useFavoritesStore.getState().setTracking(id, { enabled: true })
    useFavoritesStore.getState().setTrackingProgress(id, 2, 'cms')
    await mount()
    await settle()
    expect(host.querySelector('article')?.textContent).toContain('已追平')
    expect(mocks.tmdbDetails).not.toHaveBeenCalled()
    expect(host.querySelector('[aria-label="测试剧新季提醒"]')).toBeNull()
  })

  it('逐部累计检查进度，失败计入完成，结束后保留摘要且下一轮重新计数', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    addTrackedShow('b', '第二部剧')
    addTrackedShow('c', '第三部剧')
    const finish: Record<string, (result: DetailResult) => void> = {}
    mocks.getDetail.mockImplementation(
      (id: string) =>
        new Promise<DetailResult>(resolve => {
          finish[id] = resolve
        }),
    )
    await mount()
    await settle()
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 3,
      completed: 0,
      failed: 0,
      cached: 0,
    })
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuemax')).toBe('3')
    expect(host.querySelector('[aria-label="追更检查进度"]')?.textContent).toContain(
      '已检查 0 / 3 部',
    )
    await act(async () => finish.c(detail))
    expect(useSeriesUpdatesStore.getState().checkProgress?.completed).toBe(1)
    expect(mocks.getDetail).toHaveBeenCalledTimes(3)
    await act(async () => finish.b({ success: false, episodes: [], error: '第二部失败' }))
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 3,
      completed: 2,
      failed: 1,
      cached: 0,
    })
    expect(host.querySelector('[aria-label="追更检查进度"]')?.textContent).toContain('失败 1 部')
    await act(async () => finish.a(detail))
    expect(useSeriesUpdatesStore.getState().checking).toBe(false)
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 3,
      completed: 3,
      failed: 1,
      cached: 0,
    })
    expect(host.querySelector('[aria-label="追更检查进度"]')?.textContent).toContain(
      '检查完成 · 已检查 3 / 3 部',
    )
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('3')
    await retry('第二部剧')
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 1,
      completed: 0,
      failed: 0,
      cached: 0,
    })
    await act(async () => finish.b(detail))
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 1,
      completed: 1,
      failed: 0,
      cached: 0,
    })
    expect(host.querySelector('[aria-label="追更检查进度"]')?.textContent).not.toContain('失败')
  })

  it('缓存复用与实际网络检查分别统计，纯缓存不显示虚假的检查进度条', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    addTrackedShow('b', '第二部剧')
    addTrackedShow('c', '第三部剧')
    await mount()
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(3)
    await act(async () => root.render(null))
    expect(useSeriesUpdatesStore.getState().checkProgress).toBeNull()
    await mount()
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(3)
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 0,
      completed: 0,
      failed: 0,
      cached: 3,
    })
    expect(host.querySelector('[aria-label="追更检查进度"]')?.textContent).toBe('已复用 3 部缓存')
    expect(host.querySelector('[role="progressbar"]')).toBeNull()
    let finish!: (result: DetailResult) => void
    mocks.getDetail.mockImplementationOnce(
      () =>
        new Promise<DetailResult>(resolve => {
          finish = resolve
        }),
    )
    await act(async () => {
      addTrackedShow('d', '第四部剧')
    })
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(4)
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 1,
      completed: 0,
      failed: 0,
      cached: 3,
    })
    expect(host.querySelector('[aria-label="追更检查进度"]')?.textContent).toContain(
      '复用 3 部缓存',
    )
    await act(async () => finish(detail))
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 1,
      completed: 1,
      failed: 0,
      cached: 3,
    })
    await retry()
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 1,
      completed: 1,
      failed: 0,
      cached: 0,
    })
  })

  it('同轮重试已完成的剧集替换旧状态，不重复计算分母和失败数量', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    addTrackedShow('b', '第二部剧')
    await mount()
    await settle()
    const finish: Record<string, (result: DetailResult) => void> = {}
    mocks.getDetail.mockImplementation(
      (id: string) =>
        new Promise<DetailResult>(resolve => {
          finish[id] = resolve
        }),
    )
    await act(async () => useSeriesUpdatesStore.getState().refresh())
    await act(async () => finish.b({ success: false, episodes: [], error: '暂时失败' }))
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 2,
      completed: 1,
      failed: 1,
      cached: 0,
    })
    await retry('第二部剧')
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 2,
      completed: 0,
      failed: 0,
      cached: 0,
    })
    await act(async () => finish.a(detail))
    expect(useSeriesUpdatesStore.getState().checkProgress?.completed).toBe(1)
    await act(async () => finish.b(detail))
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 2,
      completed: 2,
      failed: 0,
      cached: 0,
    })
  })

  it('单部重查绕过30分钟缓存，只刷新目标剧集，首页与收藏入口共用状态', async () => {
    const original = useFavoritesStore.getState().favorites[0]
    useFavoritesStore.getState().setTracking(original.id, { enabled: true })
    const other = addTrackedShow('b', '另一部剧')
    await mount()
    await settle()
    const otherResult = useSeriesUpdatesStore.getState().entries[trackingKey(other)]
    mocks.getDetail.mockClear()
    let finish!: (result: DetailResult) => void
    mocks.getDetail.mockImplementationOnce(
      () =>
        new Promise<DetailResult>(resolve => {
          finish = resolve
        }),
    )
    await retry('另一部剧')
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[aria-label="重新检查另一部剧更新"]'),
    )
    expect(buttons).toHaveLength(2)
    expect(
      buttons.every(button => button.disabled && button.getAttribute('aria-busy') === 'true'),
    ).toBe(true)
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="重新检查测试剧更新"]')!.disabled,
    ).toBe(false)
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    expect(mocks.getDetail.mock.calls[0][0]).toBe('b')
    await act(async () => finish({ ...detail, episodes: [...detail.episodes, 'https://x/3'] }))
    expect(useSeriesUpdatesStore.getState().entries[trackingKey(original)].episodes).toHaveLength(2)
    expect(useSeriesUpdatesStore.getState().entries[trackingKey(other)].episodes).toHaveLength(3)
    expect(useSeriesUpdatesStore.getState().entries[trackingKey(other)]).not.toBe(otherResult)
    expect(buttons.every(button => !button.disabled)).toBe(true)
    expect(useSeriesUpdatesStore.getState().checkingKeys).toEqual([])
  })

  it('单部与全量重查共用两个并发名额，不重复排队或中断其他请求', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    addTrackedShow('b', '第二部剧')
    addTrackedShow('c', '第三部剧')
    await mount()
    await settle()
    mocks.getDetail.mockClear()
    mocks.destroy.mockClear()
    const finish: Record<string, (result: DetailResult) => void> = {}
    let active = 0
    let peak = 0
    mocks.getDetail.mockImplementation((id: string) => {
      active++
      peak = Math.max(peak, active)
      return new Promise<DetailResult>(resolve => {
        finish[id] = resolve
      }).finally(() => {
        active--
      })
    })
    await retry()
    await retry('第二部剧')
    await retry('第三部剧')
    await act(async () => {
      const store = useSeriesUpdatesStore.getState()
      const item = useFavoritesStore
        .getState()
        .favorites.find(item => item.sourceType === 'cms' && item.media.vodId === 'a')!
      store.refreshOne(store.ownerId!, trackingKey(item), trackingBindingKey(item))
      store.refresh()
    })
    expect(mocks.getDetail.mock.calls.map(call => call[0])).toEqual(['a', 'b'])
    expect(useSeriesUpdatesStore.getState().checkingKeys).toHaveLength(3)
    expect(useSeriesUpdatesStore.getState().checkProgress).toEqual({
      total: 3,
      completed: 0,
      failed: 0,
      cached: 0,
    })
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="重新检查第三部剧更新"]')!.disabled,
    ).toBe(true)
    await act(async () => finish.a(detail))
    expect(mocks.getDetail.mock.calls.map(call => call[0])).toEqual(['a', 'b', 'c'])
    expect(active).toBe(2)
    expect(useSeriesUpdatesStore.getState().checking).toBe(true)
    await act(async () => {
      finish.b(detail)
      finish.c(detail)
    })
    expect(peak).toBe(2)
    expect(mocks.destroy).not.toHaveBeenCalled()
    expect(useSeriesUpdatesStore.getState().checking).toBe(false)
    expect(useSeriesUpdatesStore.getState().checkingKeys).toEqual([])
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(3)
  })

  it('单部检查失败保留成功结果和未读提醒，再次重试成功后清除错误', async () => {
    const item = useFavoritesStore.getState().favorites[0]
    const key = trackingKey(item)
    useFavoritesStore.getState().setTracking(item.id, { enabled: true })
    await mount()
    await settle()
    mocks.getDetail.mockResolvedValueOnce({
      ...detail,
      episodes: [...detail.episodes, 'https://x/3'],
    })
    await retry()
    const successful = useSeriesUpdatesStore.getState().entries[key]
    expect(unreadEpisodeNumbers(successful)).toEqual([3])
    mocks.getDetail.mockRejectedValueOnce(new Error('单部超时'))
    await retry()
    const failed = useSeriesUpdatesStore.getState().entries[key]
    expect(failed.episodes).toEqual(successful.episodes)
    expect(failed.checkedAt).toBe(successful.checkedAt)
    expect(unreadEpisodeNumbers(failed)).toEqual([3])
    expect(host.querySelector('article')?.textContent).toContain('单部超时（显示上次成功结果）')
    expect(useSeriesUpdatesStore.getState().checking).toBe(false)
    mocks.getDetail.mockResolvedValueOnce({
      ...detail,
      episodes: [...detail.episodes, 'https://x/3', 'https://x/4'],
    })
    await retry()
    expect(useSeriesUpdatesStore.getState().entries[key].error).toBeUndefined()
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries[key])).toEqual([3, 4])
    expect(host.querySelector('article')?.textContent).not.toContain('单部超时')
  })

  it('过期绑定的单部重查被忽略，切换绑定后迟到的旧请求不能覆盖新结果', async () => {
    const item = useFavoritesStore.getState().favorites[0]
    const key = trackingKey(item)
    useFavoritesStore.getState().setTracking(item.id, { enabled: true })
    await mount()
    await settle()
    mocks.getDetail.mockClear()
    await act(async () =>
      useSeriesUpdatesStore
        .getState()
        .refreshOne(useSeriesUpdatesStore.getState().ownerId!, key, 'stale-binding'),
    )
    expect(mocks.getDetail).not.toHaveBeenCalled()
    let finish!: (result: DetailResult) => void
    mocks.getDetail.mockImplementationOnce(
      () =>
        new Promise<DetailResult>(resolve => {
          finish = resolve
        }),
    )
    await retry()
    await act(async () =>
      useFavoritesStore.getState().setTrackingBinding(
        item.id,
        {
          sourceCode: 's',
          sourceName: '源',
          vodId: 'new-resource',
          title: '新资源',
        },
        'cms',
        1,
      ),
    )
    await settle()
    const newResult = useSeriesUpdatesStore.getState().entries[key]
    expect(newResult.vodId).toBe('new-resource')
    await act(async () => finish({ ...detail, episodes: [...detail.episodes, 'https://x/3'] }))
    expect(useSeriesUpdatesStore.getState().entries[key]).toBe(newResult)
    expect(useSeriesUpdatesStore.getState().checkingKeys).toEqual([])
  })

  it('账号切换清理检查状态，旧账号单部请求的迟到结果不能写入新缓存', async () => {
    const item = useFavoritesStore.getState().favorites[0]
    useFavoritesStore.getState().setTracking(item.id, { enabled: true })
    await mount()
    await settle()
    const oldOwner = useAuthStore.getState().account!.id
    let finish!: (result: DetailResult) => void
    mocks.getDetail.mockImplementationOnce(
      () =>
        new Promise<DetailResult>(resolve => {
          finish = resolve
        }),
    )
    await retry()
    expect(useSeriesUpdatesStore.getState().checkingKeys).toHaveLength(1)
    await act(async () =>
      useAuthStore.setState({
        account: {
          ...useAuthStore.getState().account!,
          id: '00000000-0000-4000-8000-000000000002',
        },
      }),
    )
    expect(useSeriesUpdatesStore.getState().entries).toEqual({})
    expect(useSeriesUpdatesStore.getState().checkingKeys).toEqual([])
    expect(useSeriesUpdatesStore.getState().checkProgress).toBeNull()
    const token = useSeriesUpdatesStore.getState().refreshToken
    await act(async () =>
      useSeriesUpdatesStore.getState().refreshOne(oldOwner, trackingKey(item), 'auto'),
    )
    expect(useSeriesUpdatesStore.getState().refreshToken).toBe(token)
    await settle()
    const currentResult = useSeriesUpdatesStore.getState().entries[trackingKey(item)]
    await act(async () => finish({ ...detail, episodes: [...detail.episodes, 'https://x/3'] }))
    expect(useSeriesUpdatesStore.getState().entries[trackingKey(item)]).toBe(currentResult)
  })

  it('切换首页筛选仅改变展示，不重复请求视频源或更改追更设置', async () => {
    const id = useFavoritesStore.getState().favorites[0].id
    useFavoritesStore.getState().setTracking(id, { enabled: true })
    await mount()
    await settle()
    const tracking = useFavoritesStore.getState().favorites[0].tracking
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    for (const label of ['有新集', '检查异常', '待看', '全部']) {
      const button = Array.from(
        host.querySelectorAll<HTMLButtonElement>('[aria-label="追更筛选"] button'),
      ).find(button => button.textContent?.startsWith(label))!
      await act(async () => button.click())
      await settle()
      expect(host.querySelectorAll('article')).toHaveLength(
        ['待看', '全部'].includes(label) ? 1 : 0,
      )
    }
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    expect(mocks.search).not.toHaveBeenCalled()
    expect(useFavoritesStore.getState().favorites[0].tracking).toEqual(tracking)
  })

  it('搜索预览后绑定固定源，绕过旧缓存并保留已看进度，恢复原源后重新检查', async () => {
    const id = useFavoritesStore.getState().favorites[0].id
    useFavoritesStore.getState().setTracking(id, { enabled: true })
    useApiStore.setState({
      videoAPIs: [
        ...useApiStore.getState().videoAPIs,
        { id: 't', name: '新源', url: 'https://t/api', isEnabled: true },
      ],
    })
    useViewingHistoryStore.setState({
      viewingHistory: [
        {
          recordType: 'cms',
          title: '测试剧',
          imageUrl: '',
          sourceCode: 's',
          sourceName: '源',
          vodId: 'a',
          episodeIndex: 0,
          episodeName: '第01集',
          timestamp: 1,
          playbackPosition: 95,
          duration: 100,
        },
      ],
    })
    await mount()
    await settle()
    const newDetail = {
      ...detail,
      episodes: [...detail.episodes, 'https://t/3'],
      videoInfo: { title: '测试剧另一个版本', episodes_names: ['第01集', '第02集', '第03集'] },
    }
    mocks.search.mockResolvedValue({
      success: true,
      items: [{ vod_id: 'b', vod_name: '测试剧另一个版本', vod_year: '2024' }],
    })
    mocks.getDetail.mockResolvedValue(newDetail)
    await openSource()
    await act(async () => {
      const select = document.querySelector<HTMLSelectElement>('[role="dialog"] select')!
      select.value = 't'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await clickProgressButton('搜索资源')
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="选择资源：测试剧另一个版本"]')!
        .click(),
    )
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('可看 3 集')
    await clickProgressButton('确认绑定')
    expect(useFavoritesStore.getState().favorites[0].tracking?.bindings?.cms.vodId).toBe('b')
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress?.cms.completedEpisode).toBe(
      1,
    )
    expect(host.querySelector('a[href="/play/cms/s/a?ep=1"]')).toBeNull()
    await settle()
    expect(host.querySelector('article')?.textContent).toContain('2 集待看')
    expect(host.querySelector('article')?.textContent).not.toContain('新增')
    expect(host.querySelector('a[href="/play/cms/t/b?ep=1"]')).not.toBeNull()
    expect(host.querySelector('a[aria-label="打开测试剧"]')?.getAttribute('href')).toBe(
      '/play/cms/t/b',
    )
    expect(
      mocks.getDetail.mock.calls.some(([vodId, source]) => vodId === 'b' && source.id === 't'),
    ).toBe(true)
    await act(async () =>
      useViewingHistoryStore.setState({
        viewingHistory: [
          {
            recordType: 'cms',
            title: '测试剧',
            imageUrl: '',
            sourceCode: 't',
            sourceName: '新源',
            vodId: 'b',
            episodeIndex: 1,
            episodeName: '第02集',
            timestamp: Date.now() + 1,
            playbackPosition: 95,
            duration: 100,
          },
        ],
      }),
    )
    expect(host.querySelector('article')?.textContent).toContain('1 集待看')
    mocks.getDetail.mockResolvedValue(detail)
    await openSource()
    await clickProgressButton('恢复原源')
    await settle()
    expect(useFavoritesStore.getState().favorites[0].tracking?.bindings).toBeUndefined()
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress?.cms.completedEpisode).toBe(
      2,
    )
    expect(host.querySelector('article')?.textContent).toContain('已追平')
  })

  it('没有正片的资源不能绑定；关闭弹窗后迟到的搜索结果不会生效', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    mocks.search.mockResolvedValue({ success: true, items: [{ vod_id: 'b', vod_name: '空资源' }] })
    mocks.getDetail.mockResolvedValueOnce({
      success: true,
      episodes: [],
      videoInfo: { title: '空资源' },
    })
    await openSource()
    await clickProgressButton('搜索资源')
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="选择资源：空资源"]')!.click(),
    )
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('暂无可播放')
    expect(progressButton('确认绑定').disabled).toBe(true)
    let resolve!: (result: unknown) => void
    mocks.search.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done
        }),
    )
    await clickProgressButton('搜索资源')
    await clickProgressButton('取消')
    await act(async () =>
      resolve({ success: true, items: [{ vod_id: 'late', vod_name: '迟到结果' }] }),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(useFavoritesStore.getState().favorites[0].tracking?.bindings).toBeUndefined()
  })

  it('TMDB 绑定按季隔离，绑定失效时显示错误并隐藏旧资源续播链接', async () => {
    setTmdbFavorite()
    const store = useFavoritesStore.getState()
    store.setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 2 })
    await mount()
    await settle()
    const binding = { sourceCode: 's', sourceName: '源', vodId: 'manual', title: '第2季固定版本' }
    mocks.getDetail.mockResolvedValue(detail)
    await act(async () => store.setTrackingBinding('tmdb_tv_1', binding, '2', 9))
    await settle()
    expect(host.querySelector('a[href*="id=manual"]')).not.toBeNull()
    await act(async () => store.setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 1 }))
    await settle()
    expect(host.querySelector('a[href*="id=manual"]')).toBeNull()
    expect(useFavoritesStore.getState().favorites[0].tracking?.bindings?.['2']).toEqual(binding)
    mocks.getDetail.mockResolvedValue({ success: false, episodes: [], error: '固定资源已下架' })
    await act(async () => store.setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 2 }))
    await settle()
    expect(host.querySelector('article')?.textContent).toContain('固定资源已下架')
    expect(host.querySelector('a[href*="id=manual"]')).toBeNull()
    expect(
      useFavoritesStore.getState().favorites[0].tracking?.progress?.['2'].completedEpisode,
    ).toBe(9)
  })

  it('首次检查只有待看，后续新增单独提醒；标记已读保留观看进度与待看数', async () => {
    const id = useFavoritesStore.getState().favorites[0].id
    useFavoritesStore.getState().setTracking(id, { enabled: true })
    await mount()
    await settle()
    expect(host.querySelector('article')?.textContent).toContain('2 集待看')
    expect(host.querySelector('article')?.textContent).not.toContain('新增')
    mocks.getDetail.mockResolvedValueOnce({
      ...detail,
      episodes: [...detail.episodes, 'https://x/3', 'https://x/4'],
      videoInfo: { ...detail.videoInfo, episodes_names: ['第01集', '第02集', '第03集', '第04集'] },
    })
    await clickRefresh()
    expect(host.querySelector('article')?.textContent).toContain('新增 2 集')
    expect(host.querySelector('article')?.textContent).toContain('4 集待看')
    expect(host.textContent).toContain('1 部有更新')
    const favorite = useFavoritesStore.getState().favorites[0]
    const history = useViewingHistoryStore.getState().viewingHistory
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="标记测试剧更新提醒为已读"]')!.click(),
    )
    expect(host.querySelector('article')?.textContent).not.toContain('新增')
    expect(host.querySelector('article')?.textContent).toContain('4 集待看')
    expect(host.textContent).not.toContain('部有更新')
    expect(useFavoritesStore.getState().favorites[0]).toBe(favorite)
    expect(useViewingHistoryStore.getState().viewingHistory).toBe(history)
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
  })

  it('同一源ID的地址变更只重建基准，不把更多旧集误报为新增', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    mocks.getDetail.mockResolvedValue({
      ...detail,
      episodes: [...detail.episodes, 'https://x/3'],
      videoInfo: { ...detail.videoInfo, episodes_names: ['第01集', '第02集', '第03集'] },
    })
    await act(async () =>
      useApiStore.setState({
        videoAPIs: [{ id: 's', name: '源', url: 'https://new-source/api', isEnabled: true }],
      }),
    )
    await settle()
    expect(host.querySelector('article')?.textContent).toContain('3 集待看')
    expect(host.querySelector('article')?.textContent).not.toContain('新增')
  })

  it('有新集的剧优先于仅待看的剧展示', async () => {
    const store = useFavoritesStore.getState()
    const id = store.favorites[0].id
    store.setTracking(id, { enabled: true })
    store.addCmsFavorite({ vod_id: 'b', vod_name: '旧剧', source_code: 's', source_name: '源' })
    store.setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    const ownerId = useAuthStore.getState().account!.id
    const key = `${id}::cms`
    const previous = useSeriesUpdatesStore.getState().entries[key]
    await act(async () =>
      useSeriesUpdatesStore.getState().saveResult(ownerId, key, {
        ...previous,
        checkedAt: 1,
        episodes: [...previous.episodes!, { index: 2, number: 3 }],
      }),
    )
    expect(host.querySelector('article h3')?.textContent).toBe('测试剧')
    expect(host.querySelector('article')?.textContent).toContain('新增 1 集')
  })

  it('校准立即更新待看数与续播入口，可改回0或恢复历史自动计算，且不重复查源', async () => {
    const id = useFavoritesStore.getState().favorites[0].id
    useFavoritesStore.getState().setTracking(id, { enabled: true })
    useViewingHistoryStore.setState({
      viewingHistory: [
        {
          recordType: 'cms',
          title: '测试剧',
          imageUrl: '',
          sourceCode: 's',
          sourceName: '源',
          vodId: 'a',
          episodeIndex: 1,
          episodeName: '第02集',
          timestamp: 1,
          playbackPosition: 95,
          duration: 100,
        },
      ],
    })
    await mount()
    await settle()
    expect(host.querySelector('article')?.textContent).toContain('已追平')
    await openProgress()
    await setProgressInput('1')
    await clickProgressButton('保存进度')
    expect(host.textContent).toContain('1 集待看')
    expect(host.querySelector('a[href="/play/cms/s/a?ep=1"]')).not.toBeNull()
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress?.cms.completedEpisode).toBe(
      1,
    )
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    await openProgress()
    await setProgressInput('0')
    await clickProgressButton('保存进度')
    expect(host.textContent).toContain('2 集待看')
    await openProgress()
    await clickProgressButton('恢复自动计算')
    expect(host.querySelector('article')?.textContent).toContain('已追平')
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress).toBeUndefined()
    expect(useViewingHistoryStore.getState().viewingHistory).toHaveLength(1)
  })

  it('标记已追平只标记当前已知剧集，之后新增剧集仍提示待看', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    await openProgress()
    await clickProgressButton('标记已追平')
    await clickProgressButton('保存进度')
    expect(host.querySelector('article')?.textContent).toContain('已追平')
    mocks.getDetail.mockResolvedValueOnce({
      ...detail,
      episodes: [...detail.episodes, 'https://x/3'],
      videoInfo: { ...detail.videoInfo, episodes_names: ['第01集', '第02集', '第03集'] },
    })
    await clickRefresh()
    expect(host.textContent).toContain('1 集待看')
    expect(host.querySelector('a[href="/play/cms/s/a?ep=2"]')).not.toBeNull()
  })

  it('无效输入不能保存，取消编辑不会修改进度', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    await openProgress()
    for (const value of ['', '-1', '1.5']) {
      await setProgressInput(value)
      expect(progressButton('保存进度').disabled).toBe(true)
    }
    await setProgressInput('9')
    await clickProgressButton('取消')
    expect(useFavoritesStore.getState().favorites[0].tracking?.progress).toBeUndefined()
  })

  it('不同季保留各自校准，切季时未提交的编辑自动关闭', async () => {
    setTmdbFavorite()
    useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 2 })
    await mount()
    await settle()
    await openProgress()
    await setProgressInput('9')
    await clickProgressButton('保存进度')
    await act(async () =>
      useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 1 }),
    )
    await openProgress()
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe('0')
    await setProgressInput('3')
    await clickProgressButton('保存进度')
    await act(async () =>
      useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 2 }),
    )
    await openProgress()
    expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe('9')
    await setProgressInput('6')
    await act(async () =>
      useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 1 }),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () =>
      useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 2 }),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    const progress = useFavoritesStore.getState().favorites[0].tracking?.progress
    expect(progress?.['1'].completedEpisode).toBe(3)
    expect(progress?.['2'].completedEpisode).toBe(9)
  })

  it('按需加载实际季列表，不补齐缺失的季，也不包含特别篇', async () => {
    setTmdbFavorite()
    mocks.tmdbDetails.mockResolvedValue({
      seasons: [
        { season_number: 0, name: '特别篇' },
        { season_number: 3, name: '归来篇' },
        { season_number: 100, name: '终章' },
      ],
    })
    await mount()
    expect(mocks.tmdbDetails).not.toHaveBeenCalled()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(1)
    const select = host.querySelector<HTMLSelectElement>('select')!
    expect([...select.options].map(option => option.value)).toEqual(['3', '100'])
    expect(select.textContent).toContain('归来篇')
    expect(select.value).toBe('3')
    await act(async () => {
      select.value = '100'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useFavoritesStore.getState().favorites[0].tracking?.seasonNumber).toBe(100)
    // 重新开启时沿用已保存季数，元数据请求复用缓存。
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="取消追更：测试剧"]')!.click(),
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(useFavoritesStore.getState().favorites[0].tracking?.seasonNumber).toBe(100)
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(1)
  })

  it('季信息失败时不猜季数，重试成功后才开启追更', async () => {
    setTmdbFavorite()
    mocks.tmdbDetails.mockRejectedValueOnce(new Error('offline'))
    await mount()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(host.textContent).toContain('季信息加载失败')
    expect(useFavoritesStore.getState().favorites[0].tracking).toBeUndefined()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(useFavoritesStore.getState().favorites[0].tracking).toEqual({
      enabled: true,
      seasonNumber: 1,
    })
    expect(mocks.tmdbDetails).toHaveBeenCalledTimes(2)
  })

  it('空季列表不编造第1季；已保存但暂缺资料的季不会自动改写', async () => {
    setTmdbFavorite()
    mocks.tmdbDetails.mockResolvedValueOnce({ seasons: [] })
    await mount()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(useFavoritesStore.getState().favorites[0].tracking).toBeUndefined()
    expect(host.textContent).toContain('暂无可追更的正片季')
    await act(async () =>
      useFavoritesStore.getState().setTracking('tmdb_tv_1', { enabled: true, seasonNumber: 9 }),
    )
    expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('9')
    expect(host.querySelector('select')?.textContent).toContain('已保存，待确认')
    expect(useFavoritesStore.getState().favorites[0].tracking?.seasonNumber).toBe(9)
  })

  it('季信息返回前取消挂载，不会开启追更', async () => {
    setTmdbFavorite()
    let resolve!: (value: { seasons: { season_number: number; name: string }[] }) => void
    mocks.tmdbDetails.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done
        }),
    )
    await mount()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(host.textContent).toContain('加载季信息')
    await act(async () => root.render(null))
    await act(async () => resolve({ seasons: [{ season_number: 1, name: '第1季' }] }))
    expect(useFavoritesStore.getState().favorites[0].tracking).toBeUndefined()
  })

  it.each(['cms', 'tmdb'] as const)('%s 检查前和检查失败后，海报与标题仍可跳转', async type => {
    if (type === 'tmdb') setTmdbFavorite()
    const item = useFavoritesStore.getState().favorites[0]
    useFavoritesStore.getState().setTracking(item.id, { enabled: true, seasonNumber: 1 })
    mocks.getDetail.mockResolvedValue({ success: false, episodes: [], error: '源站超时' })
    await mount()
    const expectedPath = type === 'tmdb' ? '/media/tv/1' : '/play/cms/s/a'
    const expectLinks = () => {
      expect(host.querySelector('a[aria-label="打开测试剧"]')?.getAttribute('href')).toBe(
        expectedPath,
      )
      expect(host.querySelector('h3 a')?.getAttribute('href')).toBe(expectedPath)
      expect(host.querySelector(`a[href^="${expectedPath}?ep="]`)).toBeNull()
    }
    expectLinks()
    await settle()
    expect(host.querySelector('article')?.textContent).toContain(
      type === 'cms' ? '源站超时' : '未找到可确认',
    )
    expectLinks()
  })

  it('开启 TMDB 追更沿用最近的正片季，跳过第0季特别篇', async () => {
    setTmdbFavorite()
    useViewingHistoryStore.setState({
      viewingHistory: [0, 2].map((season, index) => ({
        recordType: 'tmdb',
        title: '测试剧',
        imageUrl: '',
        sourceCode: 's',
        sourceName: '源',
        vodId: 'a',
        tmdbId: 1,
        tmdbMediaType: 'tv',
        tmdbSeasonNumber: season,
        episodeIndex: 0,
        timestamp: 2 - index,
        playbackPosition: 95,
        duration: 100,
      })),
    })
    await mount()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    expect(useFavoritesStore.getState().favorites[0].tracking).toEqual({
      enabled: true,
      seasonNumber: 2,
    })
  })

  it('从收藏开启追更后自动检查，观看进度会实时消除待看提醒', async () => {
    await mount()
    expect(host.querySelector('section[aria-label="追剧更新"]')).toBeNull()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="开启追更：测试剧"]')!.click(),
    )
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('2 集待看')
    expect(host.querySelector('a[href="/play/cms/s/a?ep=0"]')).not.toBeNull()
    await act(async () =>
      useViewingHistoryStore.setState({
        viewingHistory: [
          {
            recordType: 'cms',
            title: '测试剧',
            imageUrl: '',
            sourceCode: 's',
            sourceName: '源',
            vodId: 'a',
            episodeIndex: 1,
            episodeName: '第02集',
            timestamp: 1,
            playbackPosition: 95,
            duration: 100,
          },
        ],
      }),
    )
    expect(host.querySelector('article')?.textContent).toContain('已追平')
    expect(host.textContent).not.toContain('2 集待看')
    // 云同步仅改变观看状态时，不重复请求视频源。
    await act(async () => useFavoritesStore.getState()._applyFilters())
    await settle()
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
  })

  it('刷新失败保留上次结果，手动刷新可立即重试并发现新增集数', async () => {
    useFavoritesStore
      .getState()
      .setTracking(useFavoritesStore.getState().favorites[0].id, { enabled: true })
    await mount()
    await settle()
    mocks.getDetail.mockResolvedValueOnce({ success: false, episodes: [], error: '源站超时' })
    await clickRefresh()
    expect(host.textContent).toContain('显示上次成功结果')
    expect(host.textContent).toContain('2 集待看')
    mocks.getDetail.mockResolvedValueOnce({
      ...detail,
      episodes: [...detail.episodes, 'https://x/3'],
      videoInfo: { ...detail.videoInfo, episodes_names: ['第01集', '第02集', '第03集'] },
    })
    await clickRefresh()
    expect(host.textContent).toContain('3 集待看')
    expect(host.textContent).not.toContain('源站超时')
  })

  it('取消追更会清掉缓存，进行中的迟到请求不能恢复提醒', async () => {
    const item = useFavoritesStore.getState().favorites[0]
    useFavoritesStore.getState().setTracking(item.id, { enabled: true })
    let resolve!: (detail: DetailResult) => void
    mocks.getDetail.mockImplementationOnce(
      () =>
        new Promise<DetailResult>(done => {
          resolve = done
        }),
    )
    await mount()
    await settle()
    await act(async () => useFavoritesStore.getState().setTracking(item.id, { enabled: false }))
    await act(async () => resolve(detail))
    expect(useSeriesUpdatesStore.getState().entries).toEqual({})
    expect(host.querySelector('section[aria-label="追剧更新"]')).toBeNull()
  })
})
