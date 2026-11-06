import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useTrackingSeasons } from './useTrackingSeasons'

const mock = vi.hoisted(() => ({ details: vi.fn() }))
vi.mock('@/shared/lib/tmdb', () => {
  const client = { tvShows: { details: mock.details } }
  return { getTmdbClient: () => client, resolveTmdbApiBaseUrl: () => 'https://test.invalid/3' }
})

it('四个挂起请求超时后释放名额，后续请求和原资源重试均可恢复', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const host = document.createElement('div')
  const root = createRoot(host)
  const states = new Map<number, ReturnType<typeof useTrackingSeasons>>()
  const success = { seasons: [{ season_number: 1, episode_count: 30 }], status: 'Ended' }
  mock.details.mockImplementation((id: number) => id <= 4 ? new Promise(() => {}) : Promise.resolve(success))
  function Probe({ id }: { id: number }) {
    states.set(id, useTrackingSeasons(id, true))
    return null
  }
  try {
    await act(async () => root.render(createElement('div', null,
      ...[1, 2, 3, 4, 5].map(id => createElement(Probe, { id, key: id })),
    )))
    expect(mock.details).toHaveBeenCalledTimes(4)
    await act(async () => vi.advanceTimersByTimeAsync(15000))
    expect(mock.details).toHaveBeenCalledTimes(5)
    expect(states.get(1)).toMatchObject({ loading: false, status: null, error: '季信息加载失败，请重试' })
    expect(states.get(5)).toMatchObject({ loading: false, status: 'Ended', error: null })
    mock.details.mockResolvedValue(success)
    await act(async () => { await states.get(1)!.load() })
    expect(mock.details).toHaveBeenCalledTimes(6)
    expect(states.get(1)).toMatchObject({ loading: false, status: 'Ended', error: null })
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    await act(async () => root.unmount())
    vi.useRealTimers()
  }
})
