import { useEffect, useId, useState } from 'react'
import { Bell, RefreshCw, Play, AlertCircle } from 'lucide-react'
import { NavLink } from 'react-router'
import { Button } from '@/shared/components/ui/button'
import { useFavoritesStore } from '@/features/favorites/store/favoritesStore'
import { useSeriesUpdatesStore } from '@/features/favorites/store/seriesUpdatesStore'
import {
  trackingKey,
  trackingProgress,
  trackingPlayPath,
  canTrackFavorite,
  unreadEpisodeNumbers,
  matchingTrackingUpdate,
  trackingBinding,
} from '@/features/favorites/lib/seriesTracking'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useApiStore } from '@/shared/store/apiStore'
import { useTmdbEnabled } from '@/shared/hooks/useTmdbMode'
import { getPosterUrl } from '@/shared/lib/tmdb'
import { buildCmsPlayPath, buildTmdbDetailPath } from '@/shared/lib/routes'
import { TrackingProgressControl } from '@/features/favorites/components/TrackingProgressControl'
import { TrackingSourceControl } from '@/features/favorites/components/TrackingSourceControl'
import { TrackingRefreshControl } from '@/features/favorites/components/TrackingRefreshControl'
import { NextTrackingSeason } from '@/features/favorites/components/NextTrackingSeason'
import { usePrivateModeStore } from '@/shared/store'

const FILTERS = [
  { value: 'all', label: '全部', empty: '暂无追更剧集。' },
  { value: 'new', label: '有新集', empty: '暂无新集提醒，检查到新集后会显示在这里。' },
  { value: 'pending', label: '待看', empty: '目前没有待看的剧集。' },
  { value: 'caughtUp', label: '已追平', empty: '还没有已追平的剧集。' },
  { value: 'error', label: '检查异常', empty: '暂无检查异常。' },
] as const
type TrackingFilter = (typeof FILTERS)[number]['value']

const formatCheckedAt = (time: number) =>
  new Date(time).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export function SeriesUpdates() {
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  return isPrivateMode ? null : <SeriesUpdatesContent />
}

function SeriesUpdatesContent() {
  const favorites = useFavoritesStore(state => state.favorites)
  const history = useViewingHistoryStore(state => state.viewingHistory)
  const ownerId = useAuthStore(state => state.account?.id)
  const {
    ownerId: cacheOwner,
    entries,
    checking,
    checkingKeys,
    checkProgress,
    refresh,
    markRead,
  } = useSeriesUpdatesStore()
  const sources = useApiStore(state => state.videoAPIs)
  const tmdbEnabled = useTmdbEnabled()
  const listId = useId()
  const [selection, setSelection] = useState<{ ownerId: typeof ownerId; value: TrackingFilter }>({
    ownerId,
    value: 'all',
  })
  const filter = selection.ownerId === ownerId ? selection.value : 'all'
  const batchProgress = cacheOwner === ownerId ? checkProgress : null
  useEffect(() => {
    setSelection({ ownerId, value: 'all' })
  }, [ownerId])
  const tracked = favorites.filter(
    item =>
      item.tracking?.enabled &&
      canTrackFavorite(item) &&
      (tmdbEnabled || item.sourceType === 'cms'),
  )
  const rows = tracked
    .map(item => {
      const update =
        ownerId === cacheOwner
          ? matchingTrackingUpdate(item, entries[trackingKey(item)])
          : undefined
      const progress = trackingProgress(item, update, history)
      const nextIndex = progress.nextEpisode?.index ?? update?.episodes?.[0]?.index ?? 0
      const sourceAvailable = sources.some(
        source => source.isEnabled && source.id === update?.sourceCode,
      )
      const path = update && sourceAvailable ? trackingPlayPath(item, update, nextIndex) : null
      const error =
        update?.error ||
        (update?.checkedAt && !sourceAvailable
          ? '上次检查的视频源已停用，请检查设置或重新绑定追更源'
          : undefined)
      const newCount = unreadEpisodeNumbers(update).length
      return {
        item,
        update,
        progress,
        path,
        error,
        newCount,
        isChecking: ownerId === cacheOwner && checkingKeys.includes(trackingKey(item)),
        matches: {
          all: true,
          new: newCount > 0,
          pending: progress.pendingCount > 0,
          // 无检查结果、空播放列表和失败后保留的旧结果都不能确认已追平。
          caughtUp:
            !!update?.checkedAt &&
            !!update.episodes?.length &&
            !error &&
            progress.pendingCount === 0,
          error: !!error,
        },
      }
    })
    .sort(
      (a, b) =>
        Number(b.newCount > 0) - Number(a.newCount > 0) ||
        Number(b.progress.pendingCount > 0) - Number(a.progress.pendingCount > 0) ||
        (b.update?.checkedAt ?? 0) - (a.update?.checkedAt ?? 0),
    )
  const pendingSeries = rows.filter(row => row.progress.pendingCount > 0).length
  const updatedSeries = rows.filter(row => row.newCount > 0).length
  const visibleRows = rows.filter(row => row.matches[filter])

  if (!rows.length) return null

  return (
    <section aria-label="追剧更新" className="rounded-2xl border border-border/40 bg-card/25 backdrop-blur-md p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Bell className="text-primary size-5" />
          <h2 className="text-primary text-xl font-bold tracking-tight">追剧更新</h2>
          {updatedSeries > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              {updatedSeries} 部有更新
            </span>
          )}
          {pendingSeries > 0 && (
            <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-semibold">
              {pendingSeries} 部待看
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="h-8 rounded-full text-xs">
            <NavLink to="/favorites">管理追更</NavLink>
          </Button>
          <Button size="sm" variant="outline" className="h-8 rounded-full text-xs gap-1.5" disabled={checking} onClick={refresh}>
            <RefreshCw className={`size-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? '检查中…' : '检查更新'}
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs">
        首次追更只显示待看，之后的新集单独提醒；待看集数按观看进度估算，当前未看完的一集也计入。
      </p>
      {batchProgress && (batchProgress.total > 0 || batchProgress.cached > 0) && (
        <div className="mt-3.5 space-y-1.5" aria-label="追更检查进度">
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-muted-foreground text-xs tabular-nums"
          >
            {batchProgress.total > 0
              ? `${checking ? '' : '检查完成 · '}已检查 ${batchProgress.completed} / ${batchProgress.total} 部`
              : `已复用 ${batchProgress.cached} 部缓存`}
            {batchProgress.failed > 0 && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                失败 {batchProgress.failed} 部
              </span>
            )}
            {batchProgress.total > 0 && batchProgress.cached > 0 && (
              <span className="ml-2">复用 {batchProgress.cached} 部缓存</span>
            )}
          </p>
          {batchProgress.total > 0 && (
            <div
              role="progressbar"
              aria-label="剧集检查完成进度"
              aria-valuemin={0}
              aria-valuemax={batchProgress.total}
              aria-valuenow={batchProgress.completed}
              aria-valuetext={`已检查 ${batchProgress.completed} / ${batchProgress.total} 部，失败 ${batchProgress.failed} 部`}
              className="bg-muted h-1.5 overflow-hidden rounded-full"
            >
              <div
                className="bg-primary h-full transition-[width] motion-reduce:transition-none"
                style={{ width: `${(batchProgress.completed / batchProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}
      <div role="group" aria-label="追更筛选" className="mt-3.5 flex flex-wrap gap-1.5">
        {FILTERS.map(option => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filter === option.value ? 'secondary' : 'ghost'}
            className="h-7.5 rounded-full px-3 text-xs font-medium"
            aria-pressed={filter === option.value}
            aria-controls={listId}
            onClick={() => setSelection({ ownerId, value: option.value })}
          >{option.label}<span className="text-muted-foreground tabular-nums ml-1">{rows.filter(row => row.matches[option.value]).length}</span></Button>
        ))}
      </div>
      <div id={listId} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
        {!visibleRows.length && (
          <div
            className="text-muted-foreground col-span-full py-8 text-center text-sm"
            role="status"
          >
            <p>{FILTERS.find(option => option.value === filter)?.empty}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2.5 rounded-full"
              onClick={() => setSelection({ ownerId, value: 'all' })}
            >
              查看全部追更
            </Button>
          </div>
        )}
        {visibleRows.map(({ item, update, progress, path, error, newCount, isChecking }) => {
          const title = item.sourceType === 'tmdb' ? item.media.title : item.media.vodName
          const detailPath =
            item.sourceType === 'tmdb'
              ? buildTmdbDetailPath('tv', item.media.id)
              : buildCmsPlayPath(
                  trackingBinding(item)?.sourceCode ?? item.media.sourceCode,
                  trackingBinding(item)?.vodId ?? item.media.vodId,
                )
          const poster =
            item.sourceType === 'tmdb'
              ? getPosterUrl(item.media.posterPath, 'w342')
              : item.media.vodPic
          return (
            <article key={item.id} className="group rounded-xl border border-border/30 bg-muted/20 hover:bg-muted/40 p-3 transition-colors flex gap-3.5">
              <NavLink
                to={detailPath}
                aria-label={`打开${title}`}
                className="focus-visible:ring-ring block h-28 w-[4.5rem] shrink-0 overflow-hidden rounded-lg outline-none focus-visible:ring-2 shadow-sm"
              >
                {poster ? (
                  <img src={poster} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="bg-muted text-muted-foreground flex size-full items-center justify-center">
                    <Bell className="size-6" />
                  </div>
                )}
              </NavLink>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h3 className="line-clamp-1 text-sm font-semibold text-foreground" title={title}>
                  <NavLink to={detailPath} className="hover:underline focus-visible:underline">
                    {title}
                  </NavLink>
                </h3>
                {item.sourceType === 'tmdb' && (
                  <p className="text-muted-foreground text-xs">
                    第 {item.tracking?.seasonNumber ?? 1} 季
                  </p>
                )}
                {update?.checkedAt ? (
                  <>
                    <p className="text-xs">
                      {newCount > 0 && (
                        <span className="mr-2 font-semibold text-amber-600 dark:text-amber-400">
                          新增 {newCount} 集
                        </span>
                      )}
                      更新至第 {progress.latestEpisode} 集
                      {progress.pendingCount > 0 ? (
                        <span className="text-primary ml-2 font-medium">
                          {progress.pendingCount} 集待看
                        </span>
                      ) : (
                        <span className="text-muted-foreground ml-2">已追平</span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {progress.currentEpisode
                        ? `看到第 ${progress.currentEpisode} 集`
                        : '尚未观看'}{' '}
                      · {update.sourceName}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      上次成功检查 {formatCheckedAt(update.checkedAt)}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {isChecking ? '正在检查视频源…' : '尚无检查结果'}
                  </p>
                )}
                {error && (
                  <p className="text-xs text-amber-600 dark:text-amber-400" role="status">
                    <AlertCircle className="mr-1 inline size-3" />
                    {error}
                    {update?.checkedAt ? '（显示上次成功结果）' : ''}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {path && (
                    <Button asChild size="sm" variant="secondary" className="h-7 rounded-full px-2.5 text-xs font-medium">
                      <NavLink to={path}>
                        <Play className="size-3 fill-current" />
                        {!progress.pendingCount
                          ? '重新观看'
                          : progress.currentEpisode
                            ? '继续观看'
                            : '开始观看'}
                      </NavLink>
                    </Button>
                  )}
                  <TrackingProgressControl item={item} update={update} />
                  <TrackingSourceControl item={item} />
                  <TrackingRefreshControl item={item} />
                  {newCount > 0 && update && ownerId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full px-2 text-xs"
                      aria-label={`标记${title}更新提醒为已读`}
                      title="清除新集提醒，保留待看进度"
                      onClick={() => markRead(ownerId, trackingKey(item), update)}
                    >
                      标记已读
                    </Button>
                  )}
                </div>
                <NextTrackingSeason item={item} update={update} />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
