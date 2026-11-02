import type { TmdbMediaItem } from '@/shared/types/tmdb'
import type { VideoItem } from '@xkatv/cms-core'
import { MediaPosterCard } from '@/shared/components/common/MediaPosterCard'
import { NoResultIcon } from '@/shared/components/icons'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'
import { AspectRatio } from '@/shared/components/ui/aspect-ratio'
import type { SearchMode } from './SearchModeToggle'
import { getSourceColorScheme } from '@/shared/lib/source-colors'
import { SourceStatusBadge } from './SourceStatusBadge'
import { getPosterUrl } from '@/shared/lib/tmdb'
import { buildCmsPlayPath, buildTmdbDetailPath } from '@/shared/lib/routes'

interface SearchResultsGridProps {
  /** 搜索模式 */
  mode: SearchMode
  /** TMDB 搜索结果 */
  tmdbResults?: TmdbMediaItem[]
  /** 直连搜索结果 */
  directResults?: VideoItem[]
  /** 是否加载中 */
  loading: boolean
  /** 直连搜索进度（已完成的源数量/总源数量） */
  searchProgress?: { completed: number; total: number }
  /** 成功返回结果的源 ID 集合 */
  successfulSources?: Set<string>
  /** 总结果数量（来自 API 分页信息） */
  totalResults?: number
  /** 是否正在搜索新查询（用于显示骨架屏） */
  isSearchingNewQuery?: boolean
  /** 是否还有更多内容 */
  hasMore?: boolean
  /** 当前页是否已完成（仅 Direct 模式） */
  isCurrentPageComplete?: boolean
  /** 哨兵元素引用（用于滚动加载） */
  sentinelRef?: React.RefObject<HTMLDivElement | null>
  className?: string
}

// 骨架屏数量
const SKELETON_COUNT = 18

/**
 * ResultSkeleton - 院线级海报骨架屏
 */
function ResultSkeleton() {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card/20">
        <AspectRatio ratio={2 / 3}>
          <Skeleton className="size-full rounded-none" />
        </AspectRatio>
      </div>
      <Skeleton className="h-4 w-3/4 rounded-md mt-2" />
    </div>
  )
}

/**
 * EmptyState - 空状态组件
 */
function EmptyState({ mode }: { mode: SearchMode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="size-20 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center mb-4">
        <NoResultIcon size={44} className="text-muted-foreground/60" />
      </div>
      <h3 className="text-base font-semibold text-foreground">未找到相关影视内容</h3>
      <p className="text-muted-foreground mt-1.5 text-xs sm:text-sm max-w-sm">
        {mode === 'tmdb'
          ? '尝试精简关键词，或切换至“直连聚合”模式搜索全网影视源'
          : '试试更换视频源别名，或检查关键字是否有错别字'}
      </p>
    </div>
  )
}

/**
 * SearchResultsGrid - 院线级搜索海报网格流 (Cinema Poster Grid)
 */
export function SearchResultsGrid({
  mode,
  tmdbResults = [],
  directResults = [],
  loading,
  searchProgress,
  successfulSources,
  totalResults,
  isSearchingNewQuery,
  hasMore = false,
  isCurrentPageComplete = true,
  sentinelRef,
  className,
}: SearchResultsGridProps) {
  // TMDB 模式：显示所有结果
  if (mode === 'tmdb') {
    const results = tmdbResults
    const hasResults = results.length > 0
    const showSkeleton = loading && (!hasResults || isSearchingNewQuery)

    return (
      <div className={cn('space-y-6', className)}>
        {/* 结果统计 */}
        {!loading && hasResults && totalResults !== undefined && (
          <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground px-1">
            <div>
              共检索到 <span className="text-foreground font-bold">{totalResults}</span> 部作品
              {results.length !== totalResults && (
                <>（当前已加载 <span className="text-foreground font-semibold">{results.length}</span> 部）</>
              )}
            </div>
          </div>
        )}

        {/* 内容海报网格 */}
        <div>
          {showSkeleton ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
                <ResultSkeleton key={index} />
              ))}
            </div>
          ) : hasResults ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {results.map(item => (
                <div key={`${item.mediaType}-${item.id}`}>
                  <MediaPosterCard
                    to={buildTmdbDetailPath(item.mediaType, item.id)}
                    posterUrl={getPosterUrl(item.posterPath, 'w342') || null}
                    title={item.title}
                    year={item.releaseDate ? item.releaseDate.split('-')[0] : undefined}
                    rating={item.voteAverage}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState mode="tmdb" />
          )}
        </div>

        {/* 加载更多状态哨兵 */}
        <div ref={sentinelRef} className="py-8 flex justify-center min-h-[50px]">
          {hasResults ? (
            loading ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/40 backdrop-blur-md px-4 py-1.5 text-xs text-muted-foreground shadow-xs">
                <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>加载更多精彩作品...</span>
              </div>
            ) : hasMore ? (
              <div className="inline-flex items-center rounded-full border border-border/30 bg-card/20 px-4 py-1.5 text-xs text-muted-foreground">
                下滑加载更多
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/70">
                — 已显示全部内容 —
              </div>
            )
          ) : null}
        </div>
      </div>
    )
  }

  // Direct 模式：无分页，显示所有累积结果
  const results = directResults
  const hasResults = results.length > 0

  return (
    <div className={cn('space-y-6', className)}>
      {/* 结果统计 + 源状态 */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        {hasResults ? (
          <div className="text-xs sm:text-sm text-muted-foreground">
            聚合全网找到 <span className="text-foreground font-bold">{results.length}</span> 条视频资源
          </div>
        ) : (
          <div />
        )}
        {searchProgress && (
          <SourceStatusBadge
            completed={searchProgress.completed}
            total={searchProgress.total}
            successfulSources={successfulSources}
            resultsCount={results.length}
            loading={loading}
          />
        )}
      </div>

      {/* 内容网格 */}
      <div>
        {loading && !hasResults ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <ResultSkeleton key={index} />
            ))}
          </div>
        ) : hasResults ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {results.map(item => {
              if (!item.source_code || !item.vod_id) {
                return null
              }

              const colorScheme = item.source_code
                ? getSourceColorScheme(item.source_code)
                : undefined

              return (
                <div key={`${item.source_code}-${item.vod_id}`}>
                  <MediaPosterCard
                    to={buildCmsPlayPath(item.source_code, item.vod_id)}
                    posterUrl={item.vod_pic || null}
                    title={item.vod_name}
                    year={item.vod_year}
                    topRightLabel={item.source_name}
                    topRightLabelColorScheme={colorScheme}
                    rating={
                      item.vod_douban_score !== undefined
                        ? typeof item.vod_douban_score === 'number'
                          ? item.vod_douban_score
                          : parseFloat(item.vod_douban_score)
                        : undefined
                    }
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState mode="direct" />
        )}
      </div>

      {/* 加载更多状态 */}
      {hasResults && (
        <div ref={sentinelRef} className="py-8 flex justify-center min-h-[50px]">
          {!hasMore ? (
            <div className="text-xs text-muted-foreground/70">
              — 全部源已检索完成 —
            </div>
          ) : loading && isCurrentPageComplete ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/40 backdrop-blur-md px-4 py-1.5 text-xs text-muted-foreground shadow-xs">
              <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>正在向更多源检索下一批结果...</span>
            </div>
          ) : !isCurrentPageComplete ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/40 backdrop-blur-md px-4 py-1.5 text-xs text-muted-foreground shadow-xs">
              <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>正在等待所有已连通的视频源返回...</span>
            </div>
          ) : (
            <div className="inline-flex items-center rounded-full border border-border/30 bg-card/20 px-4 py-1.5 text-xs text-muted-foreground">
              下滑加载更多
            </div>
          )}
        </div>
      )}
    </div>
  )
}
