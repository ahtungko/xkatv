import {
  useTmdbTrending,
  useTmdbMovieLists,
  useTmdbTvLists,
  useTmdbRecommendations,
} from '@/shared/hooks/useTmdb'
import { useFavoritesStore } from '@/features/favorites/store/favoritesStore'
import { useViewingHistoryStore, usePrivateModeStore } from '@/shared/store'
import { isTmdbHistoryItem } from '@/shared/lib/viewingHistory'
import { useTmdbEnabled } from '@/shared/hooks/useTmdbMode'
import type { FavoriteItem, TmdbFavoriteItem } from '@/features/favorites/types/favorites'
import type { ViewingHistoryItem } from '@/shared/types'
import type { TmdbMediaType } from '@/shared/types/tmdb'
import { FeaturedCarousel } from '../components/FeaturedCarousel'
import { ContinueWatching } from '../components/ContinueWatching'
import { SeriesUpdates } from '../components/SeriesUpdates'
import { MediaCarousel } from '../components/MediaCarousel'
import { CmsHomeContent } from '../components/CmsHomeContent'
import { useMemo } from 'react'

const emptyFavorites: FavoriteItem[] = []
const emptyHistory: ViewingHistoryItem[] = []

/**
 * TmdbHomeContent - TMDB 模式首页内容
 */
function TmdbHomeContent() {
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  const favorites = useFavoritesStore(state => isPrivateMode ? emptyFavorites : state.favorites)
  const viewingHistory = useViewingHistoryStore(state => isPrivateMode ? emptyHistory : state.viewingHistory)
  const { trending, loading } = useTmdbTrending()
  const {
    nowPlaying,
    popular: popularMovies,
    topRated: topRatedMovies,
    upcoming,
    loading: movieLoading,
  } = useTmdbMovieLists()
  const {
    airingToday,
    popular: popularTv,
    topRated: topRatedTv,
    loading: tvLoading,
  } = useTmdbTvLists()
  const tmdbRecommendationCandidates = useMemo(() => {
    if (isPrivateMode) return []
    const tmdbFavorites = favorites.filter(
      (item): item is TmdbFavoriteItem => item.sourceType === 'tmdb',
    )

    const favoriteSources = tmdbFavorites.map(item => ({
      id: item.media.id,
      mediaType: item.media.mediaType,
    }))

    const historySources = viewingHistory.filter(isTmdbHistoryItem).map(item => ({
      id: item.tmdbId,
      mediaType: item.tmdbMediaType,
    }))

    const sourceMap = new Map<string, { id: number; mediaType: TmdbMediaType }>()
    ;[...favoriteSources, ...historySources].forEach(source => {
      sourceMap.set(`${source.mediaType}-${source.id}`, source)
    })

    return Array.from(sourceMap.values())
  }, [favorites, viewingHistory, isPrivateMode])
  const { recommendations, loading: recommendationsLoading } = useTmdbRecommendations(
    tmdbRecommendationCandidates,
  )

  return (
    <div className="flex flex-col gap-8 md:gap-10 pb-8">
      {/* 首页趋势轮播 */}
      <FeaturedCarousel items={trending} loading={loading} />
      {/* 继续观看 */}
      <ContinueWatching />
      <SeriesUpdates />
      {/* 猜你喜欢 */}
      {!isPrivateMode && <MediaCarousel title="猜你喜欢" items={recommendations} loading={recommendationsLoading} />}
      {/* 正在热映 */}
      <MediaCarousel title="正在热映" items={nowPlaying} loading={movieLoading.nowPlaying} />
      {/* 最受欢迎的电影 */}
      <MediaCarousel
        title="最受欢迎的电影"
        items={popularMovies}
        loading={movieLoading.popularMovies}
      />
      {/* 口碑最佳的电影 */}
      <MediaCarousel
        title="口碑最佳的电影"
        items={topRatedMovies}
        loading={movieLoading.topRatedMovies}
      />
      {/* 即将上映 */}
      <MediaCarousel title="即将上映" items={upcoming} loading={movieLoading.upcomingMovies} />
      {/* 今日播出 */}
      <MediaCarousel title="今日播出" items={airingToday} loading={tvLoading.airingTodayTv} />
      {/* 最受欢迎的剧集 */}
      <MediaCarousel title="最受欢迎的剧集" items={popularTv} loading={tvLoading.popularTv} />
      {/* 口碑最佳的剧集 */}
      <MediaCarousel title="口碑最佳的剧集" items={topRatedTv} loading={tvLoading.topRatedTv} />
    </div>
  )
}

/**
 * HomeView - 首页视图
 * 根据 TMDB 模式状态条件渲染不同的首页内容
 */
export default function HomeView() {
  const tmdbEnabled = useTmdbEnabled()

  return tmdbEnabled ? <TmdbHomeContent /> : <CmsHomeContent />
}
