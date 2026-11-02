import { ArrowRight, RefreshCw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useAuthStore } from '@/shared/store/authStore'
import { useApiStore } from '@/shared/store/apiStore'
import { useTmdbEnabled } from '@/shared/hooks/useTmdbMode'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { useTrackingSeasons } from '../hooks/useTrackingSeasons'
import { canDiscoverNextSeason, nextAiredSeason } from '../lib/trackingSeasons'
import {
  trackingKey,
  trackingSeasonKey,
  trackingProgress,
  type SeriesUpdate,
} from '../lib/seriesTracking'
import { useFavoritesStore } from '../store/favoritesStore'
import { useSeriesUpdatesStore } from '../store/seriesUpdatesStore'
import type { FavoriteItem } from '../types/favorites'

export function NextTrackingSeason({
  item,
  update,
}: {
  item: FavoriteItem
  update?: SeriesUpdate
}) {
  const ownerId = useAuthStore(state => state.account?.id)
  const history = useViewingHistoryStore(state => state.viewingHistory)
  const sources = useApiStore(state => state.videoAPIs)
  const tmdbEnabled = useTmdbEnabled()
  const enabledSources = sources.filter(source => source.isEnabled).map(source => source.id)
  const eligible =
    !!ownerId && tmdbEnabled && canDiscoverNextSeason(item, update, history, enabledSources)
  const id = item.sourceType === 'tmdb' ? item.media.id : undefined
  const { seasons, loading, error, load } = useTrackingSeasons(id, eligible, update?.checkedAt)
  if (!eligible || item.sourceType !== 'tmdb') return null
  const currentSeason = item.tracking?.seasonNumber ?? 1
  const expectedEpisodes =
    seasons.find(season => season.number === currentSeason)?.episodeCount ?? 0
  const completed = trackingProgress(item, update, history).completedThrough
  const nextSeason =
    expectedEpisodes > 0 && completed >= expectedEpisodes
      ? nextAiredSeason(seasons, currentSeason)
      : undefined

  const switchSeason = () => {
    if (
      !nextSeason ||
      useAuthStore.getState().account?.id !== ownerId ||
      !useSettingStore.getState().system.tmdbEnabled
    )
      return
    const current = useFavoritesStore.getState().favorites.find(favorite => favorite.id === item.id)
    const cache = useSeriesUpdatesStore.getState()
    if (
      !current ||
      cache.ownerId !== ownerId ||
      trackingSeasonKey(current) !== trackingSeasonKey(item) ||
      !canDiscoverNextSeason(
        current,
        cache.entries[trackingKey(current)],
        useViewingHistoryStore.getState().viewingHistory,
        useApiStore
          .getState()
          .videoAPIs.filter(source => source.isEnabled)
          .map(source => source.id),
      ) ||
      trackingProgress(
        current,
        cache.entries[trackingKey(current)],
        useViewingHistoryStore.getState().viewingHistory,
      ).completedThrough < expectedEpisodes
    )
      return
    useFavoritesStore
      .getState()
      .setTracking(current.id, { enabled: true, seasonNumber: nextSeason.number })
  }

  return (
    <div className="space-y-1 text-xs" aria-label={`${item.media.title}新季提醒`}>
      {nextSeason && !loading && !error ? (
        <div className="bg-primary/5 border-primary/20 space-y-1 rounded-md border p-2">
          <p className="text-primary font-medium">第 {nextSeason.number} 季已开播</p>
          <p className="text-muted-foreground">
            {nextSeason.name} · 首播 {nextSeason.airDate}
          </p>
          <p className="text-muted-foreground">TMDB 显示已开播，播放资源将在切换后检查。</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 gap-1 text-xs"
            aria-label={`切换${item.media.title}追更至第${nextSeason.number}季`}
            onClick={switchSeason}
          >
            追更第 {nextSeason.number} 季<ArrowRight className="size-3" />
          </Button>
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-wrap items-center gap-1">
          {error && <span role="status">暂时无法确认新季</span>}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-1.5 text-xs"
            disabled={loading}
            aria-label={`检查${item.media.title}新季`}
            onClick={() => void load(true)}
          >
            <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '正在检查新季…' : error ? '重试检查新季' : '检查新季'}
          </Button>
        </div>
      )}
    </div>
  )
}
