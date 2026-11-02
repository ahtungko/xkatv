import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useDocumentTitle, useSearchHistory } from '@/shared/hooks'
import { useTmdbEnabled } from '@/shared/hooks/useTmdbMode'
import { useTmdbTrending } from '@/shared/hooks/useTmdb'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import { useSearchStore } from '@/shared/store/searchStore'
import { XkaLogo } from '@/shared/components/icons'
import { normalizeSearchMode } from '../lib/searchMode'

import {
  SearchModeToggle,
  SearchHubInput,
  SearchTrending,
  SearchTmdbSection,
  SearchDirectSection,
  type SearchMode,
} from '../components'

/**
 * SearchHubView - 探索与搜索中心视图 (Cinema Exploration & Search Hub)
 * 支持智能检索（TMDB 全景推荐）与直连聚合（全网资源聚合搜索）双模式
 */
export default function SearchHubView() {
  const [searchParams, setSearchParams] = useSearchParams()
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  const privateQuery = usePrivateModeStore(state => state.privateQuery)
  const setPrivateQuery = usePrivateModeStore(state => state.setPrivateQuery)
  const query = isPrivateMode ? privateQuery : searchParams.get('q') || ''

  useEffect(() => {
    if (isPrivateMode && searchParams.has('q')) {
      const q = searchParams.get('q')
      if (q && !privateQuery) {
        setPrivateQuery(q)
      }
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev)
          params.delete('q')
          return params
        },
        { replace: true },
      )
    }
  }, [isPrivateMode, privateQuery, searchParams, setPrivateQuery, setSearchParams])
  const modeParam = searchParams.get('mode')
  const tmdbEnabled = useTmdbEnabled()

  // 搜索模式状态 - 直接从 URL 获取，作为 Single Source of Truth
  const mode: SearchMode = normalizeSearchMode(modeParam, tmdbEnabled)
  const defaultMode = tmdbEnabled ? 'tmdb' : 'direct'

  const [isDirectCentered, setIsDirectCentered] = useState(false)

  // 延迟应用居中样式，等待大家都在搜出现后再下滑
  useEffect(() => {
    const shouldBeCentered = mode === 'direct' && !query
    if (shouldBeCentered) {
      const timer = setTimeout(() => setIsDirectCentered(true), 400)
      return () => clearTimeout(timer)
    } else {
      setIsDirectCentered(false)
    }
  }, [mode, query])

  // 搜索历史写入收敛到显式搜索动作，避免 URL 被动同步导致冗余写入
  const { addSearchHistoryItem } = useSearchStore()
  const { searchHistory, removeSearchHistoryItem, clearSearchHistory } = useSearchHistory()

  // 归一化 URL 中的 mode，避免非法值污染后续行为
  useEffect(() => {
    if (modeParam === 'tmdb' || modeParam === 'direct') return

    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      params.set('mode', defaultMode)
      return params
    }, { replace: true })
  }, [modeParam, defaultMode, setSearchParams])

  // Trending Hook（仅 TMDB 模式可用时调用）
  const { trending } = useTmdbTrending(tmdbEnabled && mode === 'direct' && !query)

  // 动态更新页面标题
  useDocumentTitle(query ? `${query} - 搜索` : '探索与搜索')

  // 处理模式切换
  const handleModeChange = useCallback(
    (newMode: SearchMode) => {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev)
        params.set('mode', newMode)
        return params
      })
    },
    [setSearchParams],
  )

  // 处理搜索
  const handleSearch = useCallback(
    (searchQuery: string) => {
      const normalizedQuery = searchQuery.trim().replace(/\s+/g, ' ')
      if (!normalizedQuery) return

      addSearchHistoryItem(normalizedQuery)

      if (isPrivateMode) {
        setPrivateQuery(normalizedQuery)
        return
      }

      // 更新 URL
      setSearchParams(prev => {
        const params = new URLSearchParams(prev)
        params.set('q', normalizedQuery)
        params.set('mode', mode)
        return params
      })
    },
    [addSearchHistoryItem, isPrivateMode, mode, setPrivateQuery, setSearchParams],
  )

  // 处理清除搜索
  const handleClear = useCallback(() => {
    if (isPrivateMode) {
      setPrivateQuery('')
      return
    }
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      params.delete('q')
      return params
    })
  }, [isPrivateMode, setPrivateQuery, setSearchParams])

  return (
    <div
      className={`mx-auto flex w-full max-w-7xl flex-col gap-6 sm:gap-8 px-1 sm:px-2 py-2 sm:py-4 pb-12 transition-all duration-300 ${
        isDirectCentered ? 'min-h-[55vh] justify-center' : ''
      }`}
    >
      {/* 搜索控制台 */}
      <motion.div
        layout
        className="flex w-full flex-col items-center gap-4 sm:gap-5"
        transition={{ type: 'spring', stiffness: 350, damping: 32 }}
      >
        {/* 品牌与标题标识 - 无搜索词时展示 */}
        <AnimatePresence>
          {!query && (
            <motion.div
              layout
              className="flex flex-col items-center gap-2.5 text-center pt-2 sm:pt-4"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
            >
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-primary/10 blur-xl -z-10" />
                <XkaLogo size={52} />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                探索海量精彩影视
              </h1>
              <p className="text-muted-foreground text-xs sm:text-sm tracking-wide">
                智能索引 · 多源聚合 · 发现你的下一部挚爱作品
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 模式分段选择器 - 仅 TMDB 可用时显示 */}
        {tmdbEnabled && (
          <motion.div layout>
            <SearchModeToggle mode={mode} onChange={handleModeChange} />
          </motion.div>
        )}

        {/* 搜索框胶囊 */}
        <motion.div layout className="flex w-full justify-center">
          <SearchHubInput
            initialQuery={query}
            onSearch={handleSearch}
            onClear={handleClear}
            hideHistoryDropdown={!tmdbEnabled}
          />
        </motion.div>

        {/* 兼容模式下搜索历史胶囊栏 */}
        <AnimatePresence mode="popLayout">
          {!tmdbEnabled && !query && searchHistory.length > 0 && (
            <motion.div
              layout
              className="flex w-full max-w-2xl flex-col gap-2.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-muted-foreground text-xs font-semibold">历史检索</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                  onClick={clearSearchHistory}
                >
                  清空历史
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="border border-border/40 bg-card/40 hover:bg-accent/80 text-foreground group inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition-all"
                    onClick={() => handleSearch(item.content)}
                  >
                    <span className="max-w-[10rem] truncate">{item.content}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-muted-foreground hover:text-destructive -mr-1 shrink-0 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={e => {
                        e.stopPropagation()
                        removeSearchHistoryItem(item.id)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          removeSearchHistoryItem(item.id)
                        }
                      }}
                    >
                      <X size={11} />
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 大家都在搜 / 全网热搜 */}
        <AnimatePresence mode="popLayout">
          {tmdbEnabled && mode === 'direct' && !query && (
            <SearchTrending
              trending={trending}
              onSearch={handleSearch}
              isLoading={trending.length === 0}
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* 结果区域 - 根据模式渲染不同组件 */}
      <div className="flex w-full flex-col gap-6">
        <AnimatePresence mode="wait">
          {mode === 'tmdb' ? (
            <SearchTmdbSection key="tmdb" query={query} />
          ) : (
            <SearchDirectSection key="direct" query={query} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
