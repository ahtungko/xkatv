import { useNavigate } from 'react-router'
import { useSearchStore } from '@/shared/store/searchStore'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import { trackEvent } from '@/shared/config/analytics.config'

export const useSearch = () => {
  const navigate = useNavigate()

  // 从 zustand store 获取状态和操作
  const { query, setQuery: setSearch, addSearchHistoryItem, clearQuery } = useSearchStore()
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  const privateQuery = usePrivateModeStore(state => state.privateQuery)
  const search = isPrivateMode ? privateQuery : query

  const searchMovie = (query: string, isNavigating: boolean = true) => {
    const normalizedQuery = query.trim().replace(/\s+/g, ' ')
    if (normalizedQuery.length > 0) {
      const privateMode = usePrivateModeStore.getState().isPrivateMode
      if (!privateMode) setSearch(normalizedQuery)

      // 添加到搜索历史
      addSearchHistoryItem(normalizedQuery)

      if (privateMode) {
        usePrivateModeStore.getState().setPrivateQuery(normalizedQuery)
      } else {
        trackEvent('search', { query: normalizedQuery, timestamp: new Date().toISOString() })
      }

      // 导航到搜索页面
      if (isNavigating) {
        navigate(privateMode ? '/search' : `/search?q=${encodeURIComponent(normalizedQuery)}`)
      }
    }
  }

  const clearSearch = () => {
    clearQuery()
  }

  return {
    search,
    setSearch,
    searchMovie,
    clearSearch,
  }
}
