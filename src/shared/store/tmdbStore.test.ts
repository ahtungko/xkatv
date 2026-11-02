import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TmdbMediaItem } from '@/shared/types/tmdb'

const { multiMock, listMocks } = vi.hoisted(() => ({
  multiMock: vi.fn(),
  listMocks: {
    nowPlaying: vi.fn(),
    popularMovies: vi.fn(),
    topRatedMovies: vi.fn(),
    upcomingMovies: vi.fn(),
    popularTv: vi.fn(),
    topRatedTv: vi.fn(),
    airingTodayTv: vi.fn(),
    trending: vi.fn(),
  },
}))

vi.mock('@/shared/lib/tmdb', () => ({
  getTmdbClient: () => ({
    search: {
      multi: multiMock,
    },
    movies: {
      nowPlaying: listMocks.nowPlaying,
      popular: listMocks.popularMovies,
      topRated: listMocks.topRatedMovies,
      upcoming: listMocks.upcomingMovies,
    },
    tvShows: {
      popular: listMocks.popularTv,
      topRated: listMocks.topRatedTv,
      airingToday: listMocks.airingTodayTv,
    },
    trending: { trending: listMocks.trending },
  }),
  normalizeToMediaItem: (raw: Record<string, unknown>, mediaType: 'movie' | 'tv'): TmdbMediaItem => ({
    id: raw.id as number,
    mediaType,
    title: String(raw.title ?? raw.name ?? ''),
    originalTitle: '',
    overview: '',
    posterPath: null,
    backdropPath: null,
    logoPath: null,
    releaseDate: '',
    voteAverage: 0,
    voteCount: 0,
    popularity: 0,
    genreIds: [],
    originalLanguage: 'zh',
    originCountry: [],
  }),
}))

import { useTmdbStore } from './tmdbStore'

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    void rej
  })
  return { promise, resolve }
}

function createSearchResponse(id: number, title: string) {
  return {
    page: 1,
    total_pages: 1,
    total_results: 1,
    results: [
      {
        id,
        media_type: 'movie',
        title,
      },
    ],
  }
}

describe('tmdbStore search 竞态保护', () => {
  beforeEach(() => {
    multiMock.mockReset()

    const loading = useTmdbStore.getState().loading
    useTmdbStore.setState({
      searchQuery: '',
      searchResults: [],
      filteredResults: [],
      searchPagination: { page: 1, totalPages: 0, totalResults: 0 },
      loading: { ...loading, search: false },
      error: null,
    })
  })

  it('只提交最后一次请求的结果', async () => {
    const first = createDeferred<ReturnType<typeof createSearchResponse>>()
    const second = createDeferred<ReturnType<typeof createSearchResponse>>()

    multiMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const firstSearch = useTmdbStore.getState().search('old query', 1)
    const secondSearch = useTmdbStore.getState().search('new query', 1)

    second.resolve(createSearchResponse(2, 'new-result'))
    await secondSearch

    first.resolve(createSearchResponse(1, 'old-result'))
    await firstSearch

    const state = useTmdbStore.getState()
    expect(state.searchQuery).toBe('new query')
    expect(state.searchResults).toHaveLength(1)
    expect(state.searchResults[0]?.id).toBe(2)
    expect(state.loading.search).toBe(false)
  })
})

describe('tmdbStore 榜单请求去重', () => {
  beforeEach(() => {
    Object.values(listMocks).forEach(mock => mock.mockReset())
    useTmdbStore.setState(useTmdbStore.getInitialState(), true)
  })

  it.each([
    ['fetchNowPlaying', 'nowPlaying'],
    ['fetchPopularMovies', 'popularMovies'],
    ['fetchTopRatedMovies', 'topRatedMovies'],
    ['fetchUpcomingMovies', 'upcomingMovies'],
    ['fetchPopularTv', 'popularTv'],
    ['fetchTopRatedTv', 'topRatedTv'],
    ['fetchAiringTodayTv', 'airingTodayTv'],
    ['fetchTrending', 'trending'],
  ] as const)('%s 同时被多个组件调用时只发起一次请求', async (action, key) => {
    const response = createDeferred<{ results: [] }>()
    listMocks[key].mockReturnValue(response.promise)
    const first = useTmdbStore.getState()[action]()
    const second = useTmdbStore.getState()[action]()
    expect(listMocks[key]).toHaveBeenCalledTimes(1)
    expect(useTmdbStore.getState().loading[key]).toBe(true)
    response.resolve({ results: [] })
    await Promise.all([first, second])
    expect(useTmdbStore.getState().loading[key]).toBe(false)
    // 热映榜单不再捎带请求剧集热门列表。
    if (key === 'nowPlaying') expect(listMocks.popularTv).not.toHaveBeenCalled()
  })

  it('请求失败后可以重新加载', async () => {
    listMocks.popularMovies.mockRejectedValueOnce(new Error('offline'))
    await useTmdbStore.getState().fetchPopularMovies()
    expect(useTmdbStore.getState().loading.popularMovies).toBe(false)
    listMocks.popularMovies.mockResolvedValueOnce({ results: [] })
    await useTmdbStore.getState().fetchPopularMovies()
    expect(listMocks.popularMovies).toHaveBeenCalledTimes(2)
  })
})
