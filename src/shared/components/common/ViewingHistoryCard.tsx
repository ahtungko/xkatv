import { Play } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { NavLink } from 'react-router'
import { AspectRatio } from '@/shared/components/ui/aspect-ratio'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { Progress } from '@/shared/components/ui/progress'
import { cn } from '@/shared/lib/utils'
import { buildHistoryPlayPath, isTmdbHistoryItem } from '@/shared/lib/viewingHistory'
import type { ViewingHistoryItem } from '@/shared/types'

interface ViewingHistoryCardProps {
  item: ViewingHistoryItem
  className?: string
  selectionMode?: boolean
  selected?: boolean
  mobileListLayout?: boolean
  onToggleSelect?: (item: ViewingHistoryItem) => void
}

const getPlayPath = (item: ViewingHistoryItem) => buildHistoryPlayPath(item)

const getProgressValue = (item: ViewingHistoryItem) => {
  if (item.duration <= 0) return 0
  return Math.min(100, Math.max(0, (item.playbackPosition / item.duration) * 100))
}

const formatProgressTime = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

const formatHistoryTimestamp = (timestamp: number) => {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

const getEpisodeLabel = (item: ViewingHistoryItem) => item.episodeName || `第${item.episodeIndex + 1}集`
const getRecordTypeLabel = (item: ViewingHistoryItem) => (isTmdbHistoryItem(item) ? 'TMDB' : 'CMS')
const getSourceLabel = (item: ViewingHistoryItem) => item.sourceName || item.sourceCode || '未知源'

export function ViewingHistoryCard({
  item,
  className,
  selectionMode = false,
  selected = false,
  mobileListLayout = false,
  onToggleSelect,
}: ViewingHistoryCardProps) {
  const progressValue = getProgressValue(item)
  const progressPercentLabel = `${Math.round(progressValue)}%`
  const progressDetailLabel = `${formatProgressTime(item.playbackPosition)} / ${formatProgressTime(item.duration)}`
  const timestampLabel = formatHistoryTimestamp(item.timestamp)

  const handleSelect = () => {
    onToggleSelect?.(item)
  }

  const posterCardContent = (
    <div
      className={cn(
        selectionMode
          ? 'relative cursor-pointer overflow-hidden rounded-xl border border-border/40 bg-card/30 shadow-sm'
          : 'group relative cursor-pointer overflow-hidden rounded-xl border border-border/40 bg-card/30 shadow-sm transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:border-white/20 group-hover:shadow-[0_12px_28px_rgba(0,0,0,0.45)]',
        selected && 'ring-primary ring-offset-background ring-2 ring-offset-2',
      )}
    >
      {selectionMode && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute top-2 right-2 z-20"
          >
            <Checkbox
              checked={selected}
              onCheckedChange={handleSelect}
              onClick={event => event.stopPropagation()}
              className="bg-background/80 border-white/70 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground shadow-sm"
            />
          </motion.div>
        </AnimatePresence>
      )}

      <AspectRatio ratio={1.778} className="bg-muted">
        <img
          className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          src={item.imageUrl}
          alt={item.title}
          loading="lazy"
        />

        {/* 左上角记录源标签 */}
        <div className="pointer-events-none absolute top-2 left-2 flex max-w-[82%] items-center gap-1 transition-opacity duration-300 group-hover:opacity-0">
          <span className="rounded-md border border-white/10 bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white backdrop-blur-md">
            {getRecordTypeLabel(item)}
          </span>
        </div>

        {/* 底部暗色渐变与片名 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 pt-7 transition-opacity duration-300 group-hover:opacity-0">
          <span className="line-clamp-1 text-xs md:text-sm font-medium text-white">{item.title}</span>
        </div>
      </AspectRatio>

      {/* 底部播放进度条 */}
      <Progress
        className="h-1 rounded-none border-t border-black/30 transition-opacity duration-300 group-hover:opacity-0 [&>*]:bg-primary shadow-[0_0_8px_rgba(var(--primary),0.6)]"
        value={progressValue}
      />

      {/* Hover 全卡片半透明遮罩 + 播放按钮 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="flex size-11 items-center justify-center rounded-full bg-white text-black shadow-2xl transition-transform duration-300 ease-out scale-90 group-hover:scale-100">
          <Play className="size-5 fill-current ml-0.5" />
        </div>
      </div>

      {!selectionMode ? (
        <div className="pointer-events-none absolute top-2 right-2 flex max-w-[82%] items-center gap-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="max-w-[56%] truncate rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-md">
            {getSourceLabel(item)}
          </span>
          <span className="rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-md">
            {getEpisodeLabel(item)}
          </span>
        </div>
      ) : null}

      {!selectionMode ? (
        <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md border border-white/10 bg-black/75 px-2 py-1 text-[11px] text-white backdrop-blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="font-semibold text-primary-foreground">已看 {progressPercentLabel}</span>
          <span className="text-white/75">{progressDetailLabel}</span>
        </div>
      ) : null}
    </div>
  )

  const mobileListCardContent = (
    <div
      className={cn(
        selectionMode
          ? 'relative cursor-pointer overflow-hidden rounded-xl border border-border/40 bg-card/40'
          : 'relative cursor-pointer overflow-hidden rounded-xl border border-border/40 bg-card/40 active:bg-muted/40 transition-colors',
        selected && 'ring-primary ring-offset-background ring-2 ring-offset-2',
      )}
    >
      {selectionMode && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute top-2 right-2 z-20"
          >
            <Checkbox
              checked={selected}
              onCheckedChange={handleSelect}
              onClick={event => event.stopPropagation()}
              className="bg-background/80 border-white/70 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground shadow-sm"
            />
          </motion.div>
        </AnimatePresence>
      )}

      <div className="flex items-start gap-3 p-2.5">
        <div className="relative w-[48%] shrink-0 overflow-hidden rounded-lg">
          <AspectRatio ratio={16 / 9} className="bg-muted">
            <img className="size-full object-cover" src={item.imageUrl} alt={item.title} />
            <div className="pointer-events-none absolute right-1 bottom-1 rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-white">
              {progressDetailLabel}
            </div>
            <Progress
              className="absolute inset-x-0 bottom-0 z-10 h-1 rounded-none [&>*]:bg-primary"
              value={progressValue}
            />
          </AspectRatio>
        </div>

        <div className="flex min-h-full min-w-0 flex-1 flex-col justify-between py-0.5">
          <div className="line-clamp-1 overflow-hidden text-sm font-semibold leading-5 text-foreground">
            {item.title}
          </div>

          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="max-w-[52%] truncate rounded bg-muted/70 px-1.5 py-0.5">
              {getSourceLabel(item)}
            </span>
            <span className="rounded bg-muted/70 px-1.5 py-0.5">{getEpisodeLabel(item)}</span>
          </div>

          <div className="mt-1 text-[11px] text-muted-foreground">{timestampLabel}</div>
        </div>
      </div>
    </div>
  )

  const cardContent = mobileListLayout ? (
    <>
      <div className="md:hidden">{mobileListCardContent}</div>
      <div className="hidden md:block">{posterCardContent}</div>
    </>
  ) : (
    posterCardContent
  )

  if (selectionMode) {
    return (
      <div
        className={cn('block focus-visible:outline-none select-none', className)}
        onClick={handleSelect}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleSelect()
          }
        }}
        aria-pressed={selected}
      >
        {cardContent}
      </div>
    )
  }

  return (
    <NavLink
      to={getPlayPath(item)}
      className={cn('block focus-visible:outline-none', className)}
    >
      {cardContent}
    </NavLink>
  )
}
