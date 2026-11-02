import { Layers } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { getPosterUrl } from '@/shared/lib/tmdb'
import type { TmdbMediaType } from '@/shared/types/tmdb'
import type { DetailSeason } from './types'

interface DetailSeasonsTabProps {
  tmdbType: TmdbMediaType
  seasons: DetailSeason[]
}

export function DetailSeasonsTab({ tmdbType, seasons }: DetailSeasonsTabProps) {
  if (tmdbType !== 'tv') {
    return <p className="text-muted-foreground text-xs sm:text-sm">电影类型没有季信息</p>
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-primary" />
        <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">全部季信息</h2>
      </div>

      {seasons.length > 0 ? (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          {seasons.map(season => (
            <article
              key={season.id}
              className="group flex gap-4 rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm p-3.5 sm:p-4 transition-all duration-300 hover:border-border/70 hover:bg-card/55 hover:shadow-md"
            >
              <div className="aspect-[2/3] w-20 sm:w-24 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted/30 shadow-sm">
                {season.poster_path ? (
                  <img
                    src={getPosterUrl(season.poster_path, 'w185')}
                    alt={season.name}
                    className="block h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full w-full items-center justify-center text-[10px]">
                    无海报
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                <p className="line-clamp-1 font-bold text-foreground text-sm sm:text-base group-hover:text-primary transition-colors">
                  S{season.season_number} · {season.name}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="rounded-full text-[11px] px-2.5 py-0">
                    {season.episode_count} 集
                  </Badge>
                  {season.air_date ? (
                    <Badge variant="outline" className="rounded-full text-[11px] px-2.5 py-0 border-dashed">
                      首播：{season.air_date}
                    </Badge>
                  ) : null}
                </div>
                {season.overview && (
                  <p className="text-muted-foreground line-clamp-3 text-xs leading-5">
                    {season.overview}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs sm:text-sm">当前剧集没有季列表数据</p>
      )}
    </section>
  )
}
