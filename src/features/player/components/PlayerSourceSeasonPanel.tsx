import { RadioTower, Layers3 } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import type { PlayerSeasonOption, PlayerSourceOption } from '@/features/player/hooks'

interface PlayerSourceSeasonPanelProps {
  isTmdbRoute: boolean
  sourceOptions: PlayerSourceOption[]
  selectedSourceCode: string
  onSourceChange: (sourceCode: string) => void
  seasonOptions: PlayerSeasonOption[]
  selectedSeasonNumber: number | null
  onSeasonChange: (seasonNumber: number) => void
  loadingSources: boolean
  showSourceSection?: boolean
  showSeasonSection?: boolean
  className?: string
}

export function PlayerSourceSeasonPanel({
  isTmdbRoute,
  sourceOptions,
  selectedSourceCode,
  onSourceChange,
  seasonOptions,
  selectedSeasonNumber,
  onSeasonChange,
  loadingSources,
  showSourceSection = true,
  showSeasonSection = true,
  className,
}: PlayerSourceSeasonPanelProps) {
  return (
    <section className={cn('space-y-4 rounded-2xl border border-border/40 bg-card/35 backdrop-blur-md p-3.5 sm:p-5 shadow-xs', className)}>
      {showSourceSection && (
        <article className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm sm:text-base font-bold text-foreground">
              <RadioTower className="size-4 text-primary" />
              切换视频源
            </h2>
            {isTmdbRoute && (
              <Badge variant="outline" className="rounded-full text-xs font-medium px-2.5 py-0.5 border-border/50 bg-card/60">
                {loadingSources ? '正在匹配...' : `${sourceOptions.length} 个可用源`}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {sourceOptions.map(option => {
              const active = option.sourceCode === selectedSourceCode
              return (
                <Button
                  key={option.sourceCode}
                  size="sm"
                  variant={active ? 'default' : 'secondary'}
                  className={cn(
                    'rounded-full px-3.5 h-8 text-xs sm:text-sm font-medium transition-all',
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs shadow-primary/20 scale-[1.03]'
                      : 'bg-card/50 hover:bg-card/80 border border-border/40 text-foreground/80 hover:text-foreground',
                  )}
                  onClick={() => onSourceChange(option.sourceCode)}
                >
                  {option.sourceName}
                  {isTmdbRoute && <span className="text-[11px] opacity-75 ml-1">({option.bestScore})</span>}
                </Button>
              )
            })}
          </div>
        </article>
      )}

      {showSeasonSection && seasonOptions.length > 0 && (
        <article className="space-y-3 border-t border-border/30 pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm sm:text-base font-bold text-foreground">
              <Layers3 className="size-4 text-primary" />
              选择播放季
            </h2>
            <Badge variant="outline" className="rounded-full text-xs font-medium px-2.5 py-0.5 border-border/50 bg-card/60">
              {seasonOptions.length} 季
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            {seasonOptions.map(option => {
              const active = option.seasonNumber === selectedSeasonNumber
              return (
                <Button
                  key={option.seasonNumber}
                  size="sm"
                  variant={active ? 'default' : 'secondary'}
                  className={cn(
                    'rounded-full px-3.5 h-8 text-xs sm:text-sm font-medium transition-all',
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs shadow-primary/20 scale-[1.03]'
                      : 'bg-card/50 hover:bg-card/80 border border-border/40 text-foreground/80 hover:text-foreground',
                  )}
                  onClick={() => onSeasonChange(option.seasonNumber)}
                >
                  第 {option.seasonNumber} 季
                  <span className="text-[11px] opacity-75 ml-1">({option.matchedSourceCount}源)</span>
                </Button>
              )
            })}
          </div>
        </article>
      )}
    </section>
  )
}
