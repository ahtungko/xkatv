import { useEffect, useId, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog'
import { useAuthStore } from '@/shared/store/authStore'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useFavoritesStore } from '../store/favoritesStore'
import type { FavoriteItem } from '../types/favorites'
import { trackingProgress, trackingSeasonKey, type SeriesUpdate } from '../lib/seriesTracking'

export function TrackingProgressControl({
  item,
  update,
}: {
  item: FavoriteItem
  update?: SeriesUpdate
}) {
  const ownerId = useAuthStore(state => state.account?.id)
  const history = useViewingHistoryStore(state => state.viewingHistory)
  const setProgress = useFavoritesStore(state => state.setTrackingProgress)
  const inputId = useId()
  const seasonKey = trackingSeasonKey(item)
  const identity = JSON.stringify([ownerId, item.id, seasonKey])
  const progress = trackingProgress(item, update, history)
  const [editing, setEditing] = useState<{
    identity: string
    value: string
    error?: string
  } | null>(null)
  useEffect(() => {
    setEditing(null)
  }, [identity, item.tracking?.enabled])
  const open = editing?.identity === identity && !!item.tracking?.enabled
  const value = open ? editing.value : ''
  const episode = Number(value)
  const valid = value.trim() !== '' && Number.isSafeInteger(episode) && episode >= 0
  const title = item.sourceType === 'tmdb' ? item.media.title : item.media.vodName

  const save = (targetEpisode: number | null) => {
    if (useAuthStore.getState().account?.id !== ownerId) return
    if (setProgress(item.id, targetEpisode, seasonKey)) setEditing(null)
    else
      setEditing(
        previous => previous && { ...previous, error: '追更状态已变化，请重新打开后再试。' },
      )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen =>
        setEditing(nextOpen ? { identity, value: String(progress.completedThrough) } : null)
      }
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-1.5 text-xs"
          aria-label={`校准${title}观看进度`}
        >
          <SlidersHorizontal className="size-3" />
          校准进度
          {progress.calibrated && <span className="text-muted-foreground text-[10px]">已校准</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>校准观看进度</DialogTitle>
          <DialogDescription>
            {title}
            {item.sourceType === 'tmdb' ? ` · 第 ${seasonKey} 季` : ''}。
            填写已连续看完的最后一集，0 表示尚未观看。之后的播放会继续自动更新。
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault()
            if (valid) save(episode)
          }}
        >
          <div className="space-y-2">
            <label htmlFor={inputId} className="text-sm font-medium">
              已看完第几集
            </label>
            <Input
              id={inputId}
              type="number"
              min={0}
              step={1}
              required
              value={value}
              aria-invalid={!valid}
              aria-describedby={`${inputId}-help`}
              onChange={event => setEditing({ identity, value: event.target.value })}
            />
            <p id={`${inputId}-help`} className="text-muted-foreground text-xs">
              {progress.latestEpisode
                ? `当前视频源更新至第 ${progress.latestEpisode} 集。`
                : '暂未获取到视频源集数。'}
              也可填写在其他平台看过的进度。
            </p>
            {!valid && (
              <p role="alert" className="text-destructive text-xs">
                请输入 0 或更大的整数。
              </p>
            )}
            {editing?.error && (
              <p role="alert" className="text-destructive text-xs">
                {editing.error}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!progress.latestEpisode}
              onClick={() => setEditing({ identity, value: String(progress.latestEpisode) })}
            >
              标记已追平
            </Button>
            {progress.calibrated && (
              <Button type="button" variant="ghost" size="sm" onClick={() => save(null)}>
                恢复自动计算
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button type="submit" disabled={!valid}>
              保存进度
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
