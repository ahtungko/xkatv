import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findNextRecommendationSource,
  selectRecommendationSource,
  useTmdbMovieLists,
  useTmdbTrending,
  useTmdbTvLists,
} from './useTmdb'
import { useTmdbStore } from '../store/tmdbStore'

describe('selectRecommendationSource', () => {
  it('候选为空时返回 null', () => {
    const selected = selectRecommendationSource(null, [])
    expect(selected).toBeNull()
  })

  it('上一次来源仍在候选中时优先复用，避免重渲染抖动', () => {
    const previous = { id: 100, mediaType: 'movie' as const }
    const candidates = [
      { id: 200, mediaType: 'tv' as const },
      { id: 100, mediaType: 'movie' as const },
    ]

    const selected = selectRecommendationSource(previous, candidates, () => 0)

    expect(selected).toBe(previous)
  })

  it('上一次来源不存在时按随机索引选择', () => {
    const candidates = [
      { id: 1, mediaType: 'movie' as const },
      { id: 2, mediaType: 'tv' as const },
    ]

    const selected = selectRecommendationSource(null, candidates, () => 0.75)

    expect(selected).toEqual({ id: 2, mediaType: 'tv' })
  })
})

describe('findNextRecommendationSource', () => {
  it('返回第一个未尝试的候选源', () => {
    const candidates = [
      { id: 1, mediaType: 'movie' as const },
      { id: 2, mediaType: 'tv' as const },
      { id: 3, mediaType: 'movie' as const },
    ]
    const attempted = new Set(['movie:1', 'tv:2'])

    const next = findNextRecommendationSource(candidates, attempted)

    expect(next).toEqual({ id: 3, mediaType: 'movie' })
  })

  it('全部尝试后返回 null', () => {
    const candidates = [
      { id: 1, mediaType: 'movie' as const },
      { id: 2, mediaType: 'tv' as const },
    ]
    const attempted = new Set(['movie:1', 'tv:2'])

    const next = findNextRecommendationSource(candidates, attempted)

    expect(next).toBeNull()
  })
})

describe('TMDB 榜单按需加载', () => {
  let host: HTMLDivElement
  let root: Root
  const initialState = useTmdbStore.getInitialState()
  const actions = {
    fetchNowPlaying: vi.fn(),
    fetchPopularMovies: vi.fn(),
    fetchTopRatedMovies: vi.fn(),
    fetchUpcomingMovies: vi.fn(),
    fetchAiringTodayTv: vi.fn(),
    fetchPopularTv: vi.fn(),
    fetchTopRatedTv: vi.fn(),
    fetchTrending: vi.fn(),
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.values(actions).forEach(action => action.mockReset())
    useTmdbStore.setState({ ...initialState, ...actions }, true)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    useTmdbStore.setState(initialState, true)
  })

  it('搜索趋势不会顺带请求电影热映或热门剧集', async () => {
    function Trending() {
      useTmdbTrending()
      return null
    }
    await act(async () => root.render(createElement(Trending)))
    expect(actions.fetchTrending).toHaveBeenCalledTimes(1)
    expect(actions.fetchNowPlaying).not.toHaveBeenCalled()
    expect(actions.fetchPopularTv).not.toHaveBeenCalled()
  })

  it('其他榜单返回结果时，不重复请求仍为空或加载中的榜单', async () => {
    function Lists() {
      useTmdbMovieLists()
      useTmdbTvLists()
      return null
    }
    await act(async () => root.render(createElement(Lists)))
    const item = { id: 1 } as (typeof initialState.popularMovies)[number]
    await act(async () => {
      useTmdbStore.setState({ popularMovies: [item], popularTv: [item] })
    })
    for (const [name, action] of Object.entries(actions)) {
      expect(action).toHaveBeenCalledTimes(name === 'fetchTrending' ? 0 : 1)
    }
  })

  it('不相关的推荐加载状态变化不会重渲染榜单', async () => {
    const render = vi.fn()
    function Lists() {
      useTmdbMovieLists()
      useTmdbTvLists()
      useTmdbTrending()
      render()
      return null
    }
    await act(async () => root.render(createElement(Lists)))
    const renders = render.mock.calls.length
    await act(async () => {
      useTmdbStore.setState({
        loading: { ...useTmdbStore.getState().loading, recommendations: true },
      })
    })
    expect(render).toHaveBeenCalledTimes(renders)
  })
})
