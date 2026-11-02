import { RefreshCw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useAuthStore } from '@/shared/store/authStore'
import { trackingBindingKey, trackingKey } from '../lib/seriesTracking'
import { useSeriesUpdatesStore } from '../store/seriesUpdatesStore'
import type { FavoriteItem } from '../types/favorites'

export function TrackingRefreshControl({ item }: { item: FavoriteItem }) {
  const ownerId = useAuthStore(state => state.account?.id)
  const key = trackingKey(item)
  const checking = useSeriesUpdatesStore(
    state => state.ownerId === ownerId && state.checkingKeys.includes(key),
  )
  const available = useSeriesUpdatesStore(
    state => state.ownerId === ownerId && state.activeKeys.includes(key),
  )
  const refreshOne = useSeriesUpdatesStore(state => state.refreshOne)
  const title = item.sourceType === 'tmdb' ? item.media.title : item.media.vodName
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 gap-1 px-1.5 text-xs"
      aria-label={`重新检查${title}更新`}
      aria-busy={checking}
      disabled={!ownerId || !item.tracking?.enabled || !available || checking}
      title="只检查这部剧的当前追更季"
      onClick={() => ownerId && refreshOne(ownerId, key, trackingBindingKey(item))}
    >
      <RefreshCw className={`size-3 ${checking ? 'animate-spin' : ''}`} />
      {checking ? '检查中…' : '重新检查'}
    </Button>
  )
}
