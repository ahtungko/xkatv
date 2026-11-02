import { ArrowDownUp, ArrowUpDown, Film } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import type { EpisodePageItem } from '@/features/player/hooks'

interface EpisodeRange {
  label: string
  value: string
}

interface PlayerEpisodePanelProps {
  totalEpisodes: number
  selectedEpisode: number
  isReversed: boolean
  onToggleOrder: () => void
  pageRanges: EpisodeRange[]
  currentPageRange: string
  onPageRangeChange: (value: string) => void
  episodes: EpisodePageItem[]
  onEpisodeSelect: (displayIndex: number) => void
  compact?: boolean
  fillHeight?: boolean
  hideHeader?: boolean
  className?: string
  /** 集数播放进度映射：episodeIndex → 进度百分比(0-100)，null 或 undefined 表示不显示 */
  episodeProgressMap?: Map<number, number> | null
}

export function PlayerEpisodePanel({
  totalEpisodes,
  selectedEpisode,
  isReversed,
  onToggleOrder,
  pageRanges,
  currentPageRange,
  onPageRangeChange,
  episodes,
  onEpisodeSelect,
  compact = false,
  fillHeight = false,
  hideHeader = false,
  className,
  episodeProgressMap,
}: PlayerEpisodePanelProps) {
  const sectionClassName = fillHeight
    ? 'h-full space-y-3.5 rounded-2xl border border-border/40 bg-card/35 backdrop-blur-md p-3.5 sm:p-5 shadow-xs md:flex md:flex-col md:space-y-4'
    : 'space-y-3.5 rounded-2xl border border-border/40 bg-card/35 backdrop-blur-md p-3.5 sm:p-5 shadow-xs'

  const listClassName = compact
    ? 'grid grid-cols-2 gap-2'
    : 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8'

  return (
    <section className={cn(sectionClassName, className)}>
      {!hideHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Film className="size-4 text-primary" />
            <h2 className="text-sm sm:text-base font-bold text-foreground">选集播放</h2>
            <Badge variant="secondary" className="rounded-full text-xs font-medium px-2.5 py-0.5">
              第 {selectedEpisode + 1} 集 / 共 {totalEpisodes} 集
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 rounded-full px-3 text-xs font-medium border border-border/40 bg-card/60 backdrop-blur-md hover:bg-accent shadow-xs active:scale-95 transition-all"
              onClick={onToggleOrder}
            >
              {isReversed ? <ArrowUpDown className="size-3.5 mr-1" /> : <ArrowDownUp className="size-3.5 mr-1" />}
              {isReversed ? '正序' : '倒序'}
            </Button>

            {pageRanges.length > 1 && (
              <Select value={currentPageRange} onValueChange={onPageRangeChange}>
                <SelectTrigger className="h-8 w-28 rounded-full bg-card/60 border-border/40 text-xs backdrop-blur-md shadow-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageRanges.map(range => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}

      {hideHeader && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 rounded-full px-3 text-xs font-medium border border-border/40 bg-card/60 backdrop-blur-md hover:bg-accent shadow-xs active:scale-95 transition-all"
            onClick={onToggleOrder}
          >
            {isReversed ? <ArrowUpDown className="size-3.5 mr-1" /> : <ArrowDownUp className="size-3.5 mr-1" />}
            {isReversed ? '正序' : '倒序'}
          </Button>

          {pageRanges.length > 1 && (
            <Select value={currentPageRange} onValueChange={onPageRangeChange}>
              <SelectTrigger className="h-8 w-28 rounded-full bg-card/60 border-border/40 text-xs backdrop-blur-md shadow-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageRanges.map(range => (
                  <SelectItem key={range.value} value={range.value}>
                    {range.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className={`${listClassName} ${fillHeight ? 'md:flex-1 md:content-start' : ''}`}>
        {episodes.map(episode => {
          const active = selectedEpisode === episode.actualIndex
          const progress = episodeProgressMap?.get(episode.actualIndex)
          const hasProgress = progress !== undefined && progress > 0

          return (
            <Button
              key={`${episode.actualIndex}-${episode.name}`}
              variant={active ? 'default' : 'secondary'}
              className={cn(
                'relative justify-start overflow-hidden rounded-xl h-10 sm:h-11 px-3 sm:px-3.5 font-medium transition-all duration-200 border text-xs sm:text-sm',
                active
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs shadow-primary/25 scale-[1.02]'
                  : 'bg-card/40 hover:bg-card/75 border-border/40 text-foreground/85 hover:border-border/70 hover:text-foreground',
              )}
              aria-current={active ? 'true' : undefined}
              aria-label={`切换到${episode.name || `第 ${episode.actualIndex + 1} 集`}`}
              onClick={() => onEpisodeSelect(episode.displayIndex)}
            >
              <span className="line-clamp-1 text-left">
                {episode.name || `第 ${episode.actualIndex + 1} 集`}
              </span>
              {hasProgress && !active && (
                <span
                  className="absolute inset-x-0 bottom-0 h-1 bg-primary/70 rounded-full"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              )}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
