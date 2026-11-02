import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import { useSearchStore } from '@/shared/store/searchStore'
import { useSearch } from './useSearch'

// @ts-expect-error react act environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const trackEvent = vi.hoisted(() => vi.fn())
vi.mock('@/shared/config/analytics.config', () => ({ trackEvent }))

describe('private search', () => {
  beforeEach(() => {
    trackEvent.mockClear()
    usePrivateModeStore.getState().setPrivateMode(true)
    useSearchStore.setState({ searchHistory: [] })
  })

  it('keeps the query in memory and out of the URL, analytics and history', () => {
    let search!: ReturnType<typeof useSearch>
    let location!: ReturnType<typeof useLocation>
    function Probe() {
      search = useSearch()
      location = useLocation()
      return null
    }
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(createElement(MemoryRouter, null, createElement(Probe))))
    act(() => search.searchMovie('private title'))
    expect(location.pathname).toBe('/search')
    expect(location.search).toBe('')
    expect(usePrivateModeStore.getState().privateQuery).toBe('private title')
    expect(useSearchStore.getState().searchHistory).toEqual([])
    expect(trackEvent).not.toHaveBeenCalled()
    act(() => root.unmount())
    usePrivateModeStore.getState().setPrivateMode(false)
    expect(usePrivateModeStore.getState().privateQuery).toBe('')
  })
})
