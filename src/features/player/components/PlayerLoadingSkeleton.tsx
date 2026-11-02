import { Skeleton } from '@/shared/components/ui/skeleton'

interface PlayerLoadingSkeletonProps {
  mode?: 'tmdb' | 'cms'
}

export function PlayerLoadingSkeleton({ mode = 'tmdb' }: PlayerLoadingSkeletonProps) {
  const isTmdbMode = mode === 'tmdb'

  return (
    <div className="space-y-4 md:space-y-6">
      {isTmdbMode && (
        <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border/40 bg-card/35">
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-500/10 via-transparent to-zinc-500/5" />

          <div className="relative z-10 flex min-h-[240px] flex-col justify-end p-4 pt-16 sm:min-h-[280px] sm:p-6 sm:pt-18 md:min-h-[340px] md:p-8 md:pt-20 lg:min-h-[380px] lg:p-10">
            <Skeleton className="absolute top-3 left-3 h-8 w-20 rounded-full sm:top-4 sm:left-4 sm:h-9 sm:w-24" />

            <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_140px] lg:gap-8">
              <div className="space-y-3.5">
                <div className="flex items-center gap-2 overflow-hidden pb-1">
                  <Skeleton className="h-6 w-20 rounded-full sm:h-7 sm:w-24" />
                  <Skeleton className="h-6 w-16 rounded-full sm:h-7 sm:w-20" />
                  <Skeleton className="h-6 w-24 rounded-full sm:h-7 sm:w-28" />
                </div>

                <div className="space-y-2">
                  <Skeleton className="h-7 w-[65%] max-w-[340px] sm:h-9 md:h-10 rounded-xl" />
                  <Skeleton className="h-4 w-[92%] sm:h-5 rounded-md" />
                  <Skeleton className="h-4 w-[78%] sm:h-5 rounded-md" />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Skeleton className="h-6 w-24 rounded-full sm:h-7 sm:w-28" />
                  <Skeleton className="h-6 w-20 rounded-full sm:h-7 sm:w-24" />
                </div>
              </div>

              <Skeleton className="hidden aspect-[2/3] w-full rounded-2xl lg:block" />
            </div>
          </div>
        </section>
      )}

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-2xl sm:rounded-3xl border border-border/40 bg-card">
          <Skeleton className="aspect-video min-h-[180px] w-full sm:h-[clamp(240px,56vw,74vh)] sm:min-h-[220px] sm:aspect-auto" />
        </section>

        <aside className="xl:sticky xl:top-20 xl:h-[clamp(240px,56vw,74vh)] xl:min-h-[220px] xl:pr-1">
          {isTmdbMode ? (
            <div className="space-y-3 xl:flex xl:h-full xl:flex-col xl:gap-3 xl:space-y-0">
              <section className="overflow-hidden rounded-2xl border border-border/40 bg-card/35">
                <div className="flex h-11 items-center justify-between px-3 md:px-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-border/40 bg-card/35">
                <div className="flex h-11 items-center justify-between px-3 md:px-4">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-border/40 bg-card/35 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
                <div className="flex h-11 items-center justify-between border-b border-border/40 px-3 md:px-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </div>
                <div className="grid grid-cols-2 gap-2 p-3 sm:gap-2.5 md:p-4 xl:flex-1 xl:content-start xl:overflow-hidden">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <Skeleton key={`player-episode-skeleton-${index}`} className="h-10 sm:h-11 w-full rounded-xl" />
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <section className="space-y-3 rounded-2xl border border-border/40 bg-card/35 p-3.5 sm:p-5 xl:h-full xl:min-h-0">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5 xl:content-start">
                {Array.from({ length: 12 }).map((_, index) => (
                  <Skeleton key={`player-cms-episode-skeleton-${index}`} className="h-10 sm:h-11 w-full rounded-xl" />
                ))}
              </div>
            </section>
          )}
        </aside>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/40 bg-card/35 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <div className="flex flex-col gap-4 md:grid md:grid-cols-[180px_minmax(0,1fr)]">
          <Skeleton className="aspect-[2/3] w-32 md:w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-48 rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </div>
      </section>
    </div>
  )
}
