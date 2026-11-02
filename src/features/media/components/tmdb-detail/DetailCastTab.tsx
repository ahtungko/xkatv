import { Users } from 'lucide-react'
import { getPosterUrl } from '@/shared/lib/tmdb'
import type { DetailCast } from './types'

interface DetailCastTabProps {
  castList: DetailCast[]
}

export function DetailCastTab({ castList }: DetailCastTabProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-primary" />
        <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">演职人员</h2>
      </div>

      {castList.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {castList.map(cast => (
            <div
              key={cast.id}
              className="group flex flex-col items-center gap-2 p-2 rounded-2xl transition-all duration-300 hover:bg-card/40 text-center"
            >
              <div className="size-20 sm:size-24 overflow-hidden rounded-full border-2 border-border/45 bg-muted/30 shadow-sm transition-all duration-300 group-hover:border-primary/60 group-hover:scale-105 group-hover:shadow-md ring-2 ring-transparent group-hover:ring-primary/20">
                {cast.profile_path ? (
                  <img
                    src={getPosterUrl(cast.profile_path, 'w185')}
                    alt={cast.name}
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="text-muted-foreground flex size-full items-center justify-center text-xs">
                    暂无
                  </div>
                )}
              </div>
              <div className="w-full space-y-0.5">
                <p className="line-clamp-1 text-xs sm:text-sm font-semibold text-foreground/90 transition-colors group-hover:text-primary">
                  {cast.name}
                </p>
                {cast.character && (
                  <p className="text-muted-foreground line-clamp-1 text-[11px] sm:text-xs">
                    {cast.character}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs sm:text-sm">当前条目没有演员数据</p>
      )}
    </section>
  )
}
