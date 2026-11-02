import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useFavoritesStore } from '../store/favoritesStore'
import { useSeriesUpdatesStore } from '../store/seriesUpdatesStore'
import type { FavoriteItem } from '../types/favorites'
import {
  canTrackFavorite,
  trackingKey,
  trackingProgress,
  unreadEpisodeNumbers,
  matchingTrackingUpdate,
} from '../lib/seriesTracking'
import { useTrackingSeasons } from '../hooks/useTrackingSeasons'
import { TrackingProgressControl } from './TrackingProgressControl'
import { TrackingSourceControl } from './TrackingSourceControl'
import { TrackingRefreshControl } from './TrackingRefreshControl'
import { NextTrackingSeason } from './NextTrackingSeason'

export function TrackingControl({ item }: { item: FavoriteItem }) {
  const setTracking = useFavoritesStore(state => state.setTracking)
  const ownerId = useAuthStore(state => state.account?.id)
  const update = useSeriesUpdatesStore(state =>
    state.ownerId === ownerId
      ? matchingTrackingUpdate(item, state.entries[trackingKey(item)])
      : undefined,
  )
  const history = useViewingHistoryStore(state => state.viewingHistory)
  const enabled = item.tracking?.enabled ?? false
  const tmdbId =
    item.sourceType === 'tmdb' && item.media.mediaType === 'tv' ? item.media.id : undefined
  const { seasons, loading, error, load } = useTrackingSeasons(tmdbId, enabled)
  if (!canTrackFavorite(item)) return null
  const { pendingCount, latestEpisode } = trackingProgress(item, update, history)
  const newCount = unreadEpisodeNumbers(update).length
  const selectedSeason = item.tracking?.seasonNumber
  const missingSeason =
    selectedSeason !== undefined && !seasons.some(season => season.number === selectedSeason)
  return (
    <div className="mt-2 space-y-1.5">
      <Button
        variant={enabled ? 'secondary' : 'outline'}
        size="sm"
        className="h-8 w-full gap-1 text-xs"
        aria-pressed={enabled}
        aria-label={`${enabled ? '取消' : '开启'}追更：${item.sourceType === 'tmdb' ? item.media.title : item.media.vodName}`}
        disabled={!enabled && loading}
        onClick={async () => {
          if (enabled || item.sourceType === 'cms') {
            setTracking(item.id, { ...item.tracking, enabled: !enabled })
            return
          }
          const availableSeasons = await load(!!error)
          if (!availableSeasons?.length || useAuthStore.getState().account?.id !== ownerId) return
          // 请求返回时读取最新观看记录，避免使用加载前的进度。
          const latest = useViewingHistoryStore
            .getState()
            .viewingHistory.filter(
              record =>
                record.recordType === 'tmdb' &&
                record.tmdbId === item.media.id &&
                record.tmdbMediaType === 'tv' &&
                availableSeasons.some(season => season.number === record.tmdbSeasonNumber),
            )
            .sort((a, b) => b.timestamp - a.timestamp)[0]
          const savedSeason = availableSeasons.find(
            season => season.number === item.tracking?.seasonNumber,
          )
          setTracking(item.id, {
            enabled: true,
            seasonNumber:
              savedSeason?.number ?? latest?.tmdbSeasonNumber ?? availableSeasons[0].number,
          })
        }}
      >
        {enabled ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
        {enabled ? '追更中' : loading ? '加载季信息…' : error ? '重试开启追更' : '开启追更'}
        {enabled && (newCount > 0 || pendingCount > 0) && (
          <span className="bg-primary text-primary-foreground ml-auto rounded-full px-1.5 text-[10px]">
            {newCount > 0 ? `新增 ${newCount} 集` : `${pendingCount} 集待看`}
          </span>
        )}
      </Button>
      {enabled && item.sourceType === 'tmdb' && (
        <label className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
          追更
          <select
            className="bg-background border-border text-foreground h-7 min-w-0 flex-1 truncate rounded border px-1"
            aria-label={`${item.media.title}追更季数`}
            value={selectedSeason ?? ''}
            disabled={loading || !seasons.length}
            onChange={event =>
              setTracking(item.id, { enabled: true, seasonNumber: Number(event.target.value) })
            }
          >
            {selectedSeason === undefined && (
              <option value="" disabled>
                {loading ? '加载季信息…' : '请选择季'}
              </option>
            )}
            {missingSeason && (
              <option value={selectedSeason} disabled>
                第 {selectedSeason} 季（{loading ? '加载中' : '已保存，待确认'}）
              </option>
            )}
            {seasons.map(season => (
              <option key={season.number} value={season.number}>
                {season.name === `第 ${season.number} 季` || season.name === `第${season.number}季`
                  ? `第 ${season.number} 季`
                  : `第 ${season.number} 季 · ${season.name}`}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <div className="text-muted-foreground text-center text-xs" role="status">
          <span>{error}</span>
          {enabled && (
            <button
              type="button"
              disabled={loading}
              className="ml-1 underline disabled:opacity-50"
              onClick={() => void load(true)}
            >
              {loading ? '加载中…' : '重试'}
            </button>
          )}
        </div>
      )}
      {enabled && (
        <div className="flex flex-wrap justify-center gap-1">
          <TrackingProgressControl item={item} update={update} />
          <TrackingSourceControl item={item} />
          <TrackingRefreshControl item={item} />
        </div>
      )}
      {enabled && (
        <p className="text-muted-foreground text-center text-[11px]" title={update?.error}>
          {update?.error
            ? '检查未完成，首页查看详情'
            : latestEpisode
              ? `更新至第 ${latestEpisode} 集`
              : '等待检查更新'}
        </p>
      )}
      {enabled && <NextTrackingSeason item={item} update={update} />}
    </div>
  )
}
