import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/shared/components/ui/carousel'
import { AspectRatio } from '@/shared/components/ui/aspect-ratio'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { NavLink } from 'react-router'
import { useViewingHistoryStore, usePrivateModeStore } from '@/shared/store'
import { useEffect, useMemo, useState } from 'react'
import { useIsMobile } from '@/shared/hooks/use-mobile'
import { useTmdbEnabled } from '@/shared/hooks/useTmdbMode'
import { ViewingHistoryCard } from '@/shared/components/common'

/**
 * ContinueWatchingSkeleton - 继续观看骨架屏
 */
function ContinueWatchingSkeleton() {
  const isMobile = useIsMobile()
  const skeletonCount = isMobile
    ? 2
    : typeof window !== 'undefined' && window.innerWidth < 1024
      ? 3
      : 5

  return (
    <div className="space-y-3">
      <div className="px-1">
        <Skeleton className="h-6 w-28 rounded-md" />
      </div>
      <div className="flex gap-3 md:gap-4">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div key={index} className="flex-1">
            <AspectRatio ratio={1.778}>
              <Skeleton className="size-full rounded-xl" />
            </AspectRatio>
            <Skeleton className="mt-2 h-3.5 w-3/4 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * ContinueWatching - 院线级继续观看组件
 */
export function ContinueWatching() {
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  return isPrivateMode ? null : <ContinueWatchingContent />
}

function ContinueWatchingContent() {
  const { viewingHistory } = useViewingHistoryStore()
  const hasHydrated = useViewingHistoryStore.persist.hasHydrated()
  const tmdbEnabled = useTmdbEnabled()

  // TMDB 未启用时过滤 TMDB 记录
  const filteredHistory = useMemo(() => {
    if (tmdbEnabled) return viewingHistory
    return viewingHistory.filter(item => item.recordType !== 'tmdb')
  }, [viewingHistory, tmdbEnabled])

  const isMobile = useIsMobile()
  const visibleCount = isMobile
    ? 2
    : typeof window !== 'undefined' && window.innerWidth < 1024
      ? 3
      : 5
  const canDrag = filteredHistory.length > visibleCount

  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  useEffect(() => {
    if (!carouselApi) return

    const onSelect = () => {
      setCanScrollPrev(carouselApi.canScrollPrev())
      setCanScrollNext(carouselApi.canScrollNext())
    }

    onSelect()
    carouselApi.on('select', onSelect)
    carouselApi.on('reInit', onSelect)

    return () => {
      carouselApi.off('select', onSelect)
      carouselApi.off('reInit', onSelect)
    }
  }, [carouselApi])

  if (!hasHydrated) {
    return <ContinueWatchingSkeleton />
  }

  if (filteredHistory.length === 0) {
    return null
  }

  return (
    <div className="group/carousel relative">
      {/* 标题区域 */}
      <div className="mb-3 px-1 flex items-center justify-between">
        <NavLink className="group/title inline-flex items-center gap-1.5 focus-visible:outline-none" to="/continue-watching">
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground transition-colors group-hover/title:text-primary">
            继续观看
          </h2>
          <ChevronRight className="size-4 md:size-5 text-muted-foreground transition-transform duration-200 group-hover/title:translate-x-1 group-hover/title:text-primary" />
        </NavLink>
      </div>

      {/* 滚动区域 */}
      <div className="relative">
        <Carousel opts={{ watchDrag: canDrag }} setApi={setCarouselApi}>
          <CarouselContent className="-ml-3 md:-ml-4">
            {filteredHistory.map(item => {
              return (
                <CarouselItem
                  key={`${item.sourceCode}-${item.vodId}-${item.episodeIndex}`}
                  className="h-fit basis-1/2 pl-3 md:basis-1/3 md:pl-4 lg:basis-1/5"
                >
                  <ViewingHistoryCard item={item} />
                </CarouselItem>
              )
            })}
          </CarouselContent>

          {/* 导航按钮 */}
          {canDrag && canScrollPrev && (
            <button
              type="button"
              aria-label="前一组"
              className="absolute top-1/2 -left-3 md:-left-4 z-20 flex size-9 md:size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/50 bg-background/80 backdrop-blur-md text-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:bg-background active:scale-95 lg:opacity-0 lg:group-hover/carousel:opacity-100"
              onClick={() => carouselApi?.scrollPrev()}
            >
              <ChevronLeft className="size-5" />
            </button>
          )}

          {canDrag && canScrollNext && (
            <button
              type="button"
              aria-label="后一组"
              className="absolute top-1/2 -right-3 md:-right-4 z-20 flex size-9 md:size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/50 bg-background/80 backdrop-blur-md text-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:bg-background active:scale-95 lg:opacity-0 lg:group-hover/carousel:opacity-100"
              onClick={() => carouselApi?.scrollNext()}
            >
              <ChevronRight className="size-5" />
            </button>
          )}
        </Carousel>
      </div>
    </div>
  )
}
