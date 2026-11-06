import { useTmdbEnabled } from '@/shared/hooks/useTmdbMode'
import { useTrackingSeasons } from '../hooks/useTrackingSeasons'
import type { SeriesUpdate } from '../lib/seriesTracking'
import type { FavoriteItem } from '../types/favorites'

export function SeriesCompletionStatus({
  item,
  update,
}: {
  item: FavoriteItem
  update?: SeriesUpdate
}) {
  const tmdbEnabled = useTmdbEnabled()
  const id = item.sourceType === 'tmdb' && item.media.mediaType === 'tv' ? item.media.id : undefined
  const { status } = useTrackingSeasons(
    id,
    !!id && tmdbEnabled && !!item.tracking?.enabled,
    update?.checkedAt,
  )

  if (tmdbEnabled && status === 'Ended') {
    return (
      <>
        {' '}
        ·{' '}
        <span
          className="text-emerald-600 dark:text-emerald-400"
          title="TMDB 标注全剧已完结，视频源可能尚未收录全部剧集"
        >
          全剧已完结
        </span>
      </>
    )
  }
  if (update?.sourceCompleted) {
    return (
      <>
        {' '}
        ·{' '}
        <span className="text-emerald-600 dark:text-emerald-400" title="根据当前视频源的完结标记">
          源标注已完结
        </span>
      </>
    )
  }
  return null
}
