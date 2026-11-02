import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  ExternalLink,
  Film,
  Flame,
  Heart,
  Play,
  Star,
  Tv,
} from 'lucide-react'
import { getBackdropUrl, getPosterUrl } from '@/shared/lib/tmdb'
import type { TmdbMediaItem, TmdbMediaType } from '@/shared/types/tmdb'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import type { DetailImage, TmdbRichDetail } from './types'

interface DetailHeroSectionProps {
  detail: Pick<
    TmdbMediaItem,
    'title' | 'overview' | 'posterPath' | 'backdropPath' | 'releaseDate' | 'voteAverage' | 'popularity'
  >
  richDetail: TmdbRichDetail
  tmdbType: TmdbMediaType
  releaseYear: string
  runtimeLabel: string
  adultLevel: string
  heroLogo: DetailImage | null
  favorited: boolean
  onBack: () => void
  onPlayNow: () => void
  onContinueWatching?: () => void
  continueWatchingLabel?: string
  continueWatchingProgressLabel?: string
  onToggleFavorite?: () => void
}

export function DetailHeroSection({
  detail,
  richDetail,
  tmdbType,
  releaseYear,
  runtimeLabel,
  adultLevel,
  heroLogo,
  favorited,
  onBack,
  onPlayNow,
  onContinueWatching,
  continueWatchingLabel,
  continueWatchingProgressLabel,
  onToggleFavorite,
}: DetailHeroSectionProps) {
  const heroBadgeClass =
    'h-6 gap-1 px-2.5 text-[11px] font-medium leading-none text-white/95 rounded-full bg-white/15 backdrop-blur-md border border-white/20 shadow-xs [&_svg]:size-3 md:h-7 md:gap-1.5 md:px-3 md:text-xs md:[&_svg]:size-3.5'
  const playNowLabel = onContinueWatching ? '从头播放' : '立即播放'

  return (
    <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-zinc-950 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 dark:shadow-[0_24px_60px_rgba(0,0,0,0.7)]">
      {detail.backdropPath ? (
        <img
          src={getBackdropUrl(detail.backdropPath, 'w1280')}
          alt={detail.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" />
      )}

      {/* 影院级多层晕影：左侧深暗衬底凸显文字，底部深黑锚定按钮，顶部暗化保证悬浮胶囊清晰 */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 via-45% md:via-60% to-black/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 via-35% to-transparent" />
      <div className="absolute top-0 inset-x-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />

      <Button
        variant="ghost"
        onClick={onBack}
        className="absolute top-4 left-4 z-20 h-8 sm:h-9 rounded-full px-3 gap-1.5 bg-black/40 hover:bg-black/60 active:scale-95 text-white/90 hover:text-white backdrop-blur-xl border border-white/15 shadow-md transition-all"
      >
        <ArrowLeft className="size-4" />
        <span className="text-xs sm:text-sm font-medium">返回</span>
      </Button>
      {richDetail.homepage && (
        <Button
          asChild
          variant="ghost"
          className="absolute top-4 right-20 sm:right-24 md:right-4 z-20 h-8 sm:h-9 rounded-full px-3 gap-1.5 bg-black/40 hover:bg-black/60 active:scale-95 text-white/90 hover:text-white backdrop-blur-xl border border-white/15 shadow-md transition-all"
        >
          <a href={richDetail.homepage} target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" />
            <span className="md:hidden">官网</span>
            <span className="hidden md:inline">官方页面</span>
            <span className="sr-only md:hidden">官方页面</span>
          </a>
        </Button>
      )}
      {onToggleFavorite && <Button
        variant="ghost"
        className="absolute top-4 right-4 z-20 h-8 sm:h-9 gap-1.5 rounded-full px-3 bg-black/40 hover:bg-black/60 active:scale-95 text-white/90 hover:text-white backdrop-blur-xl border border-white/15 shadow-md transition-all md:hidden"
        onClick={onToggleFavorite}
        aria-label={favorited ? '取消收藏' : '加入收藏'}
      >
        <motion.span
          key={favorited ? 'mobile-favorited' : 'mobile-unfavorited'}
          initial={{ scale: 0.65, rotate: -14, opacity: 0.6 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 24 }}
        >
          <Heart className={`size-4 transition-colors ${favorited ? 'fill-rose-500 text-rose-500' : ''}`} />
        </motion.span>
        <span className="text-xs font-medium">{favorited ? '已收藏' : '收藏'}</span>
      </Button>}

      <div className="relative z-10 flex min-h-[440px] flex-col justify-end gap-5 p-5 sm:min-h-[480px] sm:p-7 md:min-h-[620px] md:gap-6 md:p-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-4 md:max-w-2xl">
          <div className="space-y-3">
            {heroLogo ? (
              <img
                src={getPosterUrl(heroLogo.file_path, 'w500')}
                alt={detail.title}
                className="max-h-24 max-w-[78vw] object-contain drop-shadow-lg sm:max-w-[340px] md:max-h-36 md:max-w-[440px]"
              />
            ) : (
              <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-white drop-shadow-md sm:text-4xl md:text-5xl lg:text-6xl">{detail.title}</h1>
            )}
            {richDetail.tagline && <p className="text-sm italic text-white/80 font-light tracking-wide md:text-base">{richDetail.tagline}</p>}
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden text-xs md:hidden">
            <Badge className={`${heroBadgeClass} shrink-0`}>
              {tmdbType === 'movie' ? (
                <>
                  <Film />
                  电影
                </>
              ) : (
                <>
                  <Tv />
                  剧集
                </>
              )}
            </Badge>
            {releaseYear && (
              <Badge className={`${heroBadgeClass} shrink-0`}>
                <CalendarDays />
                {releaseYear}
              </Badge>
            )}
            {detail.voteAverage > 0 ? (
              <Badge className={`${heroBadgeClass} shrink-0`}>
                <Star className="fill-current text-amber-300" />
                {detail.voteAverage.toFixed(1)}
              </Badge>
            ) : (
              <Badge className={`${heroBadgeClass} shrink-0`}>
                <Flame className="text-orange-300" />
                {detail.popularity.toFixed(1)}
              </Badge>
            )}
            {adultLevel && (
              <Badge
                className={`${heroBadgeClass} shrink-0 ${adultLevel === 'NSFW' ? 'bg-red-500/80 border-red-500/40' : 'bg-emerald-500/80 border-emerald-500/40'}`}
              >
                {adultLevel}
              </Badge>
            )}
          </div>

          <div className="hidden flex-wrap items-center gap-2 text-sm md:flex">
            <Badge className={`${heroBadgeClass} hover:bg-white/25`}>
              {tmdbType === 'movie' ? (
                <>
                  <Film />
                  电影
                </>
              ) : (
                <>
                  <Tv />
                  剧集
                </>
              )}
            </Badge>
            {releaseYear && (
              <Badge className={`${heroBadgeClass} hover:bg-white/25`}>
                <CalendarDays />
                {releaseYear}
              </Badge>
            )}
            {detail.voteAverage > 0 && (
              <Badge className={`${heroBadgeClass} hover:bg-white/25`}>
                <Star className="fill-current text-amber-300" />
                {detail.voteAverage.toFixed(1)}
              </Badge>
            )}
            <Badge className={`${heroBadgeClass} hover:bg-white/25`}>
              <Flame className="text-orange-300" />
              热度 {detail.popularity.toFixed(1)}
            </Badge>
            {adultLevel && (
              <Badge
                className={`${heroBadgeClass} ${adultLevel === 'NSFW' ? 'bg-red-500/80 border-red-500/40 hover:bg-red-500' : 'bg-emerald-500/80 border-emerald-500/40 hover:bg-emerald-500'}`}
              >
                {adultLevel}
              </Badge>
            )}
            {runtimeLabel && (
              <Badge className={`${heroBadgeClass} hover:bg-white/25`}>
                <Clock3 />
                {runtimeLabel}
              </Badge>
            )}
            {tmdbType === 'tv' && (
              <Badge className={`${heroBadgeClass} hover:bg-white/25`}>
                {richDetail.number_of_seasons || 0} 季 / {richDetail.number_of_episodes || 0} 集
              </Badge>
            )}
          </div>

          <p className="line-clamp-2 text-sm leading-6 text-white/85 drop-shadow-sm md:line-clamp-4 md:text-base">{detail.overview || '暂无简介'}</p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {onContinueWatching ? (
              <Button
                className="group relative h-11 sm:h-12 rounded-full bg-[#E50914] px-6 sm:px-7 font-semibold text-white shadow-lg shadow-red-950/40 hover:bg-[#c80812] active:scale-95 transition-all"
                onClick={onContinueWatching}
              >
                <span className="inline-flex items-center gap-2 transition-opacity duration-200 group-hover:opacity-0">
                  <Play className="size-4.5 fill-current" />
                  <span>继续观看</span>
                  {continueWatchingLabel ? (
                    <span className="hidden sm:inline font-normal text-white/80">· {continueWatchingLabel}</span>
                  ) : null}
                </span>
                {continueWatchingProgressLabel ? (
                  <span className="pointer-events-none absolute inset-0 hidden items-center justify-center text-xs font-semibold tracking-wide opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:flex">
                    {continueWatchingProgressLabel}
                  </span>
                ) : null}
              </Button>
            ) : null}
            <Button
              className="h-11 sm:h-12 rounded-full bg-white px-6 sm:px-7 font-semibold text-zinc-950 shadow-lg hover:bg-white/90 active:scale-95 transition-all flex items-center gap-2"
              onClick={onPlayNow}
            >
              <Play className="size-4.5 fill-current" />
              <span>{playNowLabel}</span>
            </Button>
            {onToggleFavorite && <Button
              variant="outline"
              className="hidden h-11 sm:h-12 rounded-full border-white/25 bg-white/10 px-5 font-semibold text-white backdrop-blur-md shadow-md hover:bg-white/20 hover:text-white active:scale-95 transition-all md:inline-flex items-center gap-2"
              onClick={onToggleFavorite}
            >
              <motion.span
                key={favorited ? 'favorited' : 'unfavorited'}
                initial={{ scale: 0.65, rotate: -14, opacity: 0.6 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 24 }}
              >
                <Heart className={`size-4.5 transition-colors ${favorited ? 'fill-rose-500 text-rose-500' : ''}`} />
              </motion.span>
              <span>{favorited ? '已加入收藏' : '加入收藏'}</span>
            </Button>}
          </div>
        </div>

        <div className="hidden w-44 shrink-0 overflow-hidden rounded-2xl border border-white/20 shadow-2xl shadow-black/80 ring-1 ring-white/15 lg:block aspect-[2/3] group/poster bg-zinc-900">
          {detail.posterPath ? (
            <img
              src={getPosterUrl(detail.posterPath, 'w342')}
              alt={detail.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover/poster:scale-105"
            />
          ) : (
            <div className="bg-muted text-muted-foreground flex h-full w-full items-center justify-center text-xs">无海报</div>
          )}
        </div>
      </div>
    </section>
  )
}
