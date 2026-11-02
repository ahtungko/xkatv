import { ArrowLeft, Sparkles, Tv, Film } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { getBackdropUrl, getPosterUrl } from '@/shared/lib/tmdb'
import type { TmdbMediaType } from '@/shared/types/tmdb'

interface PlayerHeroSectionProps {
  modeLabel: string
  sourceName: string
  title: string
  overview: string
  posterPath?: string | null
  backdropPath?: string | null
  tmdbMediaType: TmdbMediaType | null
  currentEpisodeText: string
  totalEpisodeText: string
  onBack: () => void
}

export function PlayerHeroSection({
  modeLabel,
  sourceName,
  title,
  overview,
  posterPath,
  backdropPath,
  tmdbMediaType,
  currentEpisodeText,
  totalEpisodeText,
  onBack,
}: PlayerHeroSectionProps) {
  const mediaTypeText = tmdbMediaType === 'tv' ? '剧集' : tmdbMediaType === 'movie' ? '电影' : null
  const heroBadgeClass =
    'h-6 sm:h-7 px-2.5 sm:px-3 text-[11px] sm:text-xs font-medium rounded-full bg-white/15 text-white backdrop-blur-md border border-white/20 shadow-xs flex items-center gap-1.5'

  return (
    <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-zinc-950 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 dark:shadow-[0_24px_60px_rgba(0,0,0,0.7)]">
      {backdropPath ? (
        <img
          src={getBackdropUrl(backdropPath, 'w1280')}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
      )}

      {/* 影院级暗光与晕影 */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 via-45% md:via-60% to-black/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 via-35% to-transparent" />
      <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(239,68,68,0.18),transparent_42%)]" />

      <Button
        variant="ghost"
        className="absolute top-3 left-3 z-20 h-8 sm:h-9 rounded-full px-3 gap-1.5 bg-black/40 hover:bg-black/60 active:scale-95 text-white/90 hover:text-white backdrop-blur-xl border border-white/15 shadow-md transition-all sm:top-4 sm:left-4"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" />
        <span className="text-xs sm:text-sm font-medium">返回</span>
      </Button>

      <div className="relative z-10 flex min-h-[240px] flex-col justify-end p-4 pt-16 sm:min-h-[280px] sm:p-6 sm:pt-18 md:min-h-[340px] md:p-8 md:pt-20 lg:min-h-[380px] lg:p-10">
        <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_140px] lg:gap-8">
          <div className="space-y-3.5 lg:max-w-4xl">
            <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
              <Badge className={`${heroBadgeClass} hover:bg-white/25`}>
                {modeLabel}
              </Badge>
              {mediaTypeText && (
                <Badge className={`${heroBadgeClass} hover:bg-white/25`}>
                  {tmdbMediaType === 'tv' ? <Tv className="size-3.5" /> : <Film className="size-3.5" />}
                  {mediaTypeText}
                </Badge>
              )}
              <Badge className="h-6 sm:h-7 px-2.5 sm:px-3 text-[11px] sm:text-xs font-semibold rounded-full bg-red-600/90 text-white backdrop-blur-md border border-red-500/40 shadow-xs flex items-center gap-1.5 hover:bg-red-600">
                <Sparkles className="size-3.5" />
                {sourceName}
              </Badge>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <h1 className="line-clamp-2 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white drop-shadow-md">
                {title}
              </h1>
              <p className="line-clamp-2 text-xs sm:text-sm leading-relaxed text-white/85 drop-shadow-sm md:line-clamp-3 md:text-[15px]">
                {overview || '暂无剧情简介'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
              <Badge className={`${heroBadgeClass} hover:bg-white/25`}>
                当前 {currentEpisodeText}
              </Badge>
              <Badge className={`${heroBadgeClass} hover:bg-white/25`}>
                总计 {totalEpisodeText}
              </Badge>
            </div>
          </div>

          {posterPath ? (
            <div className="hidden lg:block w-34 shrink-0 overflow-hidden rounded-2xl border border-white/20 shadow-2xl shadow-black/80 ring-1 ring-white/15 aspect-[2/3] group/poster bg-zinc-900">
              <img
                src={getPosterUrl(posterPath, 'w342')}
                alt={title}
                className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover/poster:scale-105"
              />
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
      </div>
    </section>
  )
}
