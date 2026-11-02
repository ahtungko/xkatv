import { useSearchStore } from '@/shared/store/searchStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'

export const useSearchHistory = () => {
  const { searchHistory, addSearchHistoryItem, removeSearchHistoryItem, clearSearchHistory } =
    useSearchStore()
  const isSearchHistoryVisible = useSettingStore(state => state.search.isSearchHistoryVisible)
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)

  return {
    // 当 isSearchHistoryVisible 为 false 或处于无痕模式时返回空数组，阻止搜索历史下拉展示
    searchHistory: isSearchHistoryVisible && !isPrivateMode ? searchHistory : [],
    addSearchHistoryItem,
    removeSearchHistoryItem,
    clearSearchHistory,
  }
}
