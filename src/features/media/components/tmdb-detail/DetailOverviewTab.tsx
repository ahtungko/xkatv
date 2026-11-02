import { Info, Sparkles } from 'lucide-react'
import { MediaPosterCard } from '@/shared/components/common'
import { Badge } from '@/shared/components/ui/badge'
import { getPosterUrl } from '@/shared/lib/tmdb'
import { buildTmdbDetailPath } from '@/shared/lib/routes'
import type { TmdbMediaItem, TmdbMediaType } from '@/shared/types/tmdb'
import { getReleaseYear } from './helpers'
import { DetailInfoGrid } from './DetailInfoGrid'
import type { DetailGenre, DetailInfoField, DetailKeyword } from './types'

interface DetailOverviewTabProps {
  tmdbType: TmdbMediaType
  genres: DetailGenre[]
  keywordList: DetailKeyword[]
  coreInfoFields: DetailInfoField[]
  movieInfoFields: DetailInfoField[]
  tvInfoFields: DetailInfoField[]
  recommendationItems: TmdbMediaItem[]
}

export function DetailOverviewTab({
  tmdbType,
  genres,
  keywordList,
  coreInfoFields,
  movieInfoFields,
  tvInfoFields,
  recommendationItems,
}: DetailOverviewTabProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">基础信息</h2>
        </div>

        {genres.length > 0 || keywordList.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {genres.map(genre => (
              <Badge
                key={genre.id}
                variant="outline"
                className="rounded-full bg-primary/10 text-primary border-primary/25 px-3 py-1 text-xs font-medium hover:bg-primary/15 transition-colors shadow-2xs"
              >
                {genre.name}
              </Badge>
            ))}
            {keywordList.map(keyword => (
              <Badge
                key={keyword.id}
                variant="outline"
                className="rounded-full bg-card/60 text-muted-foreground border-border/50 px-3 py-1 text-xs font-normal hover:text-foreground hover:border-border transition-colors shadow-2xs"
              >
                #{keyword.name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs sm:text-sm">暂无类型或关键词标签</p>
        )}

        <DetailInfoGrid fields={coreInfoFields} className="sm:grid-cols-2 lg:grid-cols-3" />

        {tmdbType === 'movie' && movieInfoFields.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <h3 className="text-sm sm:text-base font-semibold text-foreground/90">电影补充信息</h3>
            <DetailInfoGrid fields={movieInfoFields} className="sm:grid-cols-2 lg:grid-cols-4" />
          </div>
        )}

        {tmdbType === 'tv' && tvInfoFields.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <h3 className="text-sm sm:text-base font-semibold text-foreground/90">剧集补充信息</h3>
            <DetailInfoGrid fields={tvInfoFields} className="sm:grid-cols-2 lg:grid-cols-3" />
          </div>
        )}
      </section>

      <section className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">你可能还喜欢</h2>
        </div>

        {recommendationItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {recommendationItems.map(item => (
              <MediaPosterCard
                key={`${item.mediaType}-${item.id}`}
                to={buildTmdbDetailPath(item.mediaType, item.id)}
                posterUrl={getPosterUrl(item.posterPath, 'w342') || null}
                title={item.title}
                year={getReleaseYear(item.releaseDate)}
                rating={item.voteAverage}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs sm:text-sm">当前没有可展示的相关推荐</p>
        )}
      </section>
    </div>
  )
}
