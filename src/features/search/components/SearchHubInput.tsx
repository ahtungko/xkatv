import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, History, Trash2, ArrowRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverAnchor } from '@/shared/components/ui/popover'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { useSearchHistory, useSearchSuggestions } from '@/shared/hooks'
import { usePrivateModeStore } from '@/shared/store'

interface SearchHubInputProps {
  /** Initial query from URL */
  initialQuery: string
  /** Callback when search is triggered */
  onSearch: (query: string) => void
  /** Callback when clear button is clicked */
  onClear?: () => void
  /** 禁用搜索历史下拉（由外部渲染历史） */
  hideHistoryDropdown?: boolean
  className?: string
}

export function SearchHubInput({
  initialQuery,
  onSearch,
  onClear,
  hideHistoryDropdown = false,
  className = '',
}: SearchHubInputProps) {
  const [inputValue, setInputValue] = useState(initialQuery)
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { searchHistory, removeSearchHistoryItem } = useSearchHistory()
  const {
    suggestions,
    isLoading: suggestionsLoading,
    fetchSuggestions,
    clearSuggestions,
  } = useSearchSuggestions()

  // Sync with initialQuery prop
  useEffect(() => {
    setInputValue(initialQuery)
  }, [initialQuery])

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])

  const hasContent = inputValue.trim().length > 0
  const hasHistory = searchHistory.length > 0
  const hasSuggestions = suggestions.length > 0
  const shouldShowDropdown =
    isDropdownOpen && (hasContent ? hasSuggestions || suggestionsLoading : hasHistory && !hideHistoryDropdown)

  const handleInteractiveItemKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    action: () => void,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    action()
  }

  const handleSearch = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) return

      setInputValue(searchQuery)
      setIsDropdownOpen(false)
      clearSuggestions()
      onSearch(searchQuery)
    },
    [clearSuggestions, onSearch],
  )

  const handleInputChange = (value: string) => {
    setInputValue(value)
    if (value.trim()) {
      fetchSuggestions(value)
    } else {
      clearSuggestions()
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch(inputValue)
    }
    if (event.key === 'Escape') {
      setIsDropdownOpen(false)
      inputRef.current?.blur()
    }
  }

  const handleFocus = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
    }
    setIsDropdownOpen(true)
  }

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsDropdownOpen(false)
    }, 200)
  }

  const handleClear = () => {
    setInputValue('')
    clearSuggestions()
    onClear?.()
    inputRef.current?.focus()
  }

  return (
    <div className={`w-full max-w-2xl ${className}`}>
      <Popover open={shouldShowDropdown}>
        <PopoverAnchor asChild>
          <div className="relative flex items-center w-full h-12 md:h-13 rounded-full border border-border/50 bg-card/50 backdrop-blur-xl shadow-lg shadow-black/5 dark:shadow-black/25 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition-all">
            {/* 前置放大镜图标 */}
            <Search
              className="text-muted-foreground ml-4 shrink-0 transition-colors"
              size={18}
            />

            {/* 一体化无缝输入框 */}
            <input
              ref={inputRef}
              type="text"
              placeholder={isPrivateMode ? "搜索电影、剧集、演员... (无痕模式)" : "搜索电影、剧集、演员..."}
              className="h-full flex-1 bg-transparent border-0 px-3 text-sm md:text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              value={inputValue}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />

            {/* 清空按钮 */}
            {inputValue.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground size-7 rounded-full hover:bg-muted/70 flex items-center justify-center mr-1 transition-colors"
                aria-label="清空输入"
              >
                <X size={15} />
              </button>
            )}

            {/* 灵动搜索胶囊按钮 */}
            <button
              type="button"
              disabled={inputValue.length === 0}
              onClick={() => handleSearch(inputValue)}
              className="mr-1.5 h-9 md:h-9.5 px-4 rounded-full bg-primary text-primary-foreground font-semibold text-xs md:text-sm flex items-center gap-1.5 shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>搜索</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </PopoverAnchor>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-1.5 rounded-2xl border border-border/50 bg-popover/90 backdrop-blur-2xl shadow-2xl"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <ScrollArea className="max-h-80 px-1 py-0.5">
            {!hasContent ? (
              // 搜索历史记录
              <div className="space-y-1">
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <History size={13} />
                  <span>最近搜索</span>
                </div>
                {searchHistory.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-foreground hover:bg-accent/80 cursor-pointer transition-colors group"
                    onClick={() => handleSearch(item.content)}
                    onKeyDown={e => handleInteractiveItemKeyDown(e, () => handleSearch(item.content))}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="truncate">{item.content}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 size-6 rounded-full flex items-center justify-center transition-opacity"
                      onClick={e => {
                        e.stopPropagation()
                        removeSearchHistoryItem(item.id)
                      }}
                      aria-label="删除此条记录"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              // 智能补全联想
              <div className="space-y-1">
                {suggestionsLoading ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                    正在联想...
                  </div>
                ) : (
                  suggestions.map((suggestion, index) => (
                    <div
                      key={suggestion.id || index}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-foreground hover:bg-accent/80 cursor-pointer transition-colors"
                      onClick={() => handleSearch(suggestion.title)}
                      onKeyDown={e => handleInteractiveItemKeyDown(e, () => handleSearch(suggestion.title))}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Search size={14} className="text-muted-foreground shrink-0" />
                        <span className="truncate">{suggestion.title}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground/70 shrink-0 ml-2">
                        {suggestion.mediaType === 'movie' ? '电影' : '剧集'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  )
}
