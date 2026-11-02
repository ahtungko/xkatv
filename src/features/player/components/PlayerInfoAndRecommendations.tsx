import { NavLink } from 'react-router'
import { Star, CalendarDays, Clapperboard, Tv, Heart, Info, ArrowUpRight } from 'lucide-react'
import type { TmdbMediaItem, TmdbMediaType } from '@/shared/types/tmdb'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { MediaPosterCard } from '@/shared/components/common'
import { getPosterUrl } from '@/shared/lib/tmdb'
import { buildTmdbDetailPath } from '@/shared/lib/routes'

interface PlayerInfoAndRecommendationsProps {
  title: string
  originalTitle?: string
  overview: string
  sourceName: string
  modeLabel: string
  releaseDate?: string
  rating?: number
  posterPath?: string | null
  cmsCover?: string
  tmdbMediaType: TmdbMediaType | null
  seasonCount?: number
  episodeCount?: number
  detailLink?: string
  showRecommendations?: boolean
  favoriteAction?: {
    active: boolean
    onToggle: () => void
  }
  recommendations: TmdbMediaItem[]
}

export function PlayerInfoAndRecommendations({
  title,
  originalTitle,
  overview,
  sourceName,
  modeLabel,
  releaseDate,
  rating,
  posterPath,
  cmsCover,
  tmdbMediaType,
  seasonCount,
  episodeCount,
  detailLink,
  showRecommendations = true,
  favoriteAction,
  recommendations,
}: PlayerInfoAndRecommendationsProps) {
  const infoPoster = posterPath ? getPosterUrl(posterPath, 'w342') : cmsCover || ''

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/40 bg-card/35 backdrop-blur-md p-4 sm:p-6 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="size-4 text-primary" />
            <h2 className="text-base sm:text-lg font-bold text-foreground">影视介绍</h2>
          </div>
          <div className="flex items-center gap-2">
            {favoriteAction ? (
              <Button
                size="sm"
                variant={favoriteAction.active ? 'default' : 'secondary'}
                className="h-8 rounded-full px-3.5 text-xs font-medium border border-border/40 bg-card/60 backdrop-blur-md hover:bg-accent shadow-xs active:scale-95 transition-all"
                onClick={favoriteAction.onToggle}
              >
                <Heart className={`size-3.5 mr-1 ${favoriteAction.active ? 'fill-current text-white' : ''}`} />
                {favoriteAction.active ? '已收藏' : '加入收藏'}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-4 md:grid md:grid-cols-[180px_minmax(0,1fr)] md:gap-6">
            <div className="w-full">
              <div className="relative mx-auto aspect-[2/3] w-32 overflow-hidden rounded-xl border border-border/40 bg-muted/30 shadow-md md:mx-0 md:w-full">
                {infoPoster ? (
                  <img
                    src={infoPoster}
                    alt={title}
                    className="absolute inset-0 block h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full items-center justify-center text-xs">暂无海报</div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 md:hidden">
                <Badge variant="secondary" className="h-6 rounded-full px-2.5 text-[11px] font-medium">
                  {sourceName}
                </Badge>
                <Badge variant="outline" className="h-6 rounded-full px-2.5 text-[11px] border-border/50">
                  {modeLabel}
                </Badge>
                {tmdbMediaType && (
                  <Badge variant="outline" className="h-6 rounded-full px-2.5 text-[11px] border-border/50">
                    {tmdbMediaType === 'tv' ? '剧集' : '电影'}
                  </Badge>
                )}
                {releaseDate && (
                  <Badge variant="outline" className="h-6 rounded-full px-2.5 text-[11px] border-border/50">
                    <CalendarDays className="size-3 mr-1" />
                    {releaseDate.slice(0, 4)}
                  </Badge>
                )}
                {rating && rating > 0 ? (
                  <Badge variant="outline" className="h-6 rounded-full px-2.5 text-[11px] border-border/50">
                    <Star className="size-3 text-amber-400 fill-amber-400 mr-1" />
                    {rating.toFixed(1)}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <div className="space-y-1 text-center md:text-left">
                <h2 className="line-clamp-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h2>
                {originalTitle && originalTitle !== title && (
                  <p className="text-muted-foreground line-clamp-1 text-xs sm:text-sm font-normal">{originalTitle}</p>
                )}
              </div>

              <div className="hidden flex-wrap items-center gap-2 md:flex">
                <Badge variant="secondary" className="h-6.5 rounded-full px-3 text-xs font-medium">
                  {sourceName}
                </Badge>
                <Badge variant="outline" className="h-6.5 rounded-full px-3 text-xs border-border/50 bg-card/40">
                  {modeLabel}
                </Badge>
                {tmdbMediaType && (
                  <Badge variant="outline" className="h-6.5 rounded-full px-3 text-xs border-border/50 bg-card/40">
                    {tmdbMediaType === 'tv' ? '剧集' : '电影'}
                  </Badge>
                )}
                {releaseDate && (
                  <Badge variant="outline" className="h-6.5 rounded-full px-3 text-xs border-border/50 bg-card/40">
                    <CalendarDays className="size-3.5 mr-1" />
                    {releaseDate.slice(0, 10)}
                  </Badge>
                )}
                {rating && rating > 0 ? (
                  <Badge variant="outline" className="h-6.5 rounded-full px-3 text-xs border-border/50 bg-card/40">
                    <Star className="size-3.5 text-amber-400 fill-amber-400 mr-1" />
                    {rating.toFixed(1)}
                  </Badge>
                ) : null}
                {tmdbMediaType === 'tv' && seasonCount && episodeCount ? (
                  <Badge variant="outline" className="h-6.5 rounded-full px-3 text-xs border-border/50 bg-card/40">
                    <Tv className="size-3.5 mr-1" />
                    共 {seasonCount} 季 / {episodeCount} 集
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-1.5 pt-1">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground/90">剧情梗概</h3>
                <p className="text-muted-foreground line-clamp-4 text-xs sm:text-sm leading-relaxed md:line-clamp-6">{overview || '暂无剧情介绍'}</p>
              </div>
            </div>
          </div>

          {detailLink ? (
            <div className="flex justify-end pt-2 border-t border-border/30">
              <NavLink
                to={detailLink}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <span>完整条目详情</span>
                <ArrowUpRight className="size-3.5" />
              </NavLink>
            </div>
          ) : null}
        </div>
      </section>

      {showRecommendations && (
        <section className="space-y-4 rounded-2xl border border-border/40 bg-card/35 backdrop-blur-md p-4 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clapperboard className="size-4 text-primary" />
              <h2 className="text-base sm:text-lg font-bold text-foreground">猜你还喜欢</h2>
            </div>
            <NavLink to="/" className="text-muted-foreground text-xs hover:text-foreground transition-colors">
              更多推荐 →
            </NavLink>
          </div>

          {recommendations.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {recommendations.slice(0, 12).map(item => (
                <MediaPosterCard
                  key={`${item.mediaType}-${item.id}`}
                  to={buildTmdbDetailPath(item.mediaType, item.id)}
                  posterUrl={getPosterUrl(item.posterPath, 'w342')}
                  title={item.title}
                  showTitle
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs sm:text-sm">暂无推荐内容</p>
          )}
        </section>
      )}
    </div>
  )
}
