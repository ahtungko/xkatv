import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/shared/lib/utils'
import type { TmdbFilterOptions, TmdbGenre, TmdbCountry } from '@/shared/types/tmdb'
import {
  MediaTypeFilter,
  CountryFilter,
  GenreFilter,
  YearFilter,
  AdvancedFilter,
  FilterSkeleton,
  ExpandToggle,
} from './category-filter'

interface CategoryFilterSectionProps {
  /** 电影分类列表 */
  movieGenres: TmdbGenre[]
  /** 剧集分类列表 */
  tvGenres: TmdbGenre[]
  /** 国家列表 */
  countries: TmdbCountry[]
  /** 可用年份列表 */
  years: number[]
  /** 当前筛选条件 */
  filterOptions: TmdbFilterOptions
  /** 筛选条件变更回调 */
  onFilterChange: (options: Partial<TmdbFilterOptions>) => void
  /** 清除所有筛选条件 */
  onClear: () => void
  /** 是否加载中 */
  isLoading?: boolean
  className?: string
}

/**
 * CategoryFilterSection - 院线级分类筛选胶囊面板 (Cinema Capsule Filter Panel)
 * 提供媒体类型、国家/地区、分类、年份、评分和排序等多维度胶囊化筛选
 */
export function CategoryFilterSection({
  movieGenres,
  tvGenres,
  countries,
  years,
  filterOptions,
  onFilterChange,
  onClear,
  isLoading = false,
  className,
}: CategoryFilterSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (isLoading) {
    return <FilterSkeleton />
  }

  const hasActiveFilters = Boolean(
    (filterOptions.mediaType && filterOptions.mediaType !== 'all') ||
    filterOptions.originCountry ||
    (filterOptions.genreIds && filterOptions.genreIds.length > 0) ||
    filterOptions.releaseYear ||
    filterOptions.minVoteAverage ||
    filterOptions.sortBy
  )

  return (
    <div className={cn('rounded-2xl border border-border/40 bg-card/25 backdrop-blur-md p-4 sm:p-5 shadow-xs space-y-3.5', className)}>
      {/* 基础筛选：媒体类型 */}
      <MediaTypeFilter
        filterOptions={filterOptions}
        onFilterChange={onFilterChange}
      />

      {/* 地区筛选 */}
      <CountryFilter
        countries={countries}
        filterOptions={filterOptions}
        onFilterChange={onFilterChange}
      />

      {/* 展开后显示的更多筛选 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-3.5 overflow-hidden pt-0.5"
          >
            {/* 分类筛选 */}
            <GenreFilter
              movieGenres={movieGenres}
              tvGenres={tvGenres}
              filterOptions={filterOptions}
              onFilterChange={onFilterChange}
            />

            {/* 年份筛选 */}
            <YearFilter
              years={years}
              filterOptions={filterOptions}
              onFilterChange={onFilterChange}
            />

            {/* 评分和排序 */}
            <AdvancedFilter
              filterOptions={filterOptions}
              onFilterChange={onFilterChange}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 展开/收起与清空筛选栏 */}
      <div className="flex items-center justify-between border-t border-border/30 pt-3">
        <div>
          {hasActiveFilters ? (
            <button
              type="button"
              className="text-xs text-primary font-medium hover:underline underline-offset-4 transition-colors"
              onClick={onClear}
            >
              清空已选筛选
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground/70">可按多个维度自由组合筛选</span>
          )}
        </div>
        <ExpandToggle isExpanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)} />
      </div>
    </div>
  )
}
