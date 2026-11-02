import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MediaPosterCard } from '@/shared/components/common'
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/shared/components/ui/carousel'
import { AspectRatio } from '@/shared/components/ui/aspect-ratio'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { NavLink } from 'react-router'
import { useEffect, useState } from 'react'
import { useIsMobile } from '@/shared/hooks/use-mobile'
import { getPosterUrl } from '@/shared/lib/tmdb'
import type { TmdbMediaItem } from '@/shared/types/tmdb'
import { buildTmdbDetailPath } from '@/shared/lib/routes'

interface MediaCarouselProps {
  /** 板块标题 */
  title: string
  /** 媒体数据列表 */
  items: TmdbMediaItem[]
  /** 加载状态 */
  loading?: boolean
  /** 查看全部 */
  linkTo?: string
}

/**
 * MediaCarouselSkeleton - 媒体轮播骨架屏
 */
function MediaCarouselSkeleton({ title }: { title: string }) {
  const isMobile = useIsMobile()
  const skeletonCount = isMobile
    ? 3
    : typeof window !== 'undefined' && window.innerWidth < 1024
      ? 4
      : 6

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div className="px-1">
        <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground">{title}</h2>
      </div>
      {/* 卡片骨架 */}
      <div className="flex gap-3 md:gap-4">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div key={index} className="flex-1">
            <AspectRatio ratio={2 / 3}>
              <Skeleton className="size-full rounded-xl" />
            </AspectRatio>
            <Skeleton className="mt-2.5 h-4 w-3/4 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * MediaCarousel - 院线级媒体轮播组件 (Cinema Media Carousel)
 */
export function MediaCarousel({ title, items, loading = false, linkTo }: MediaCarouselProps) {
  const isMobile = useIsMobile()
  const isTablet = !isMobile && typeof window !== 'undefined' && window.innerWidth < 1024
  const visibleCount = isMobile ? 3 : isTablet ? 4 : 6
  const slidesToScroll = isMobile ? 3 : isTablet ? 4 : 6
  const canDrag = items.length > visibleCount

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

  if (loading) {
    return <MediaCarouselSkeleton title={title} />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="group/carousel relative">
      {/* 标题区域 */}
      <div className="mb-3 px-1 flex items-center justify-between">
        {linkTo ? (
          <NavLink className="group/title inline-flex items-center gap-1.5 focus-visible:outline-none" to={linkTo}>
            <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground transition-colors group-hover/title:text-primary">
              {title}
            </h2>
            <ChevronRight className="size-4 md:size-5 text-muted-foreground transition-transform duration-200 group-hover/title:translate-x-1 group-hover/title:text-primary" />
          </NavLink>
        ) : (
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground">{title}</h2>
        )}
      </div>

      {/* 滚动区域 */}
      <div className="relative">
        <Carousel opts={{ watchDrag: canDrag, slidesToScroll }} setApi={setCarouselApi}>
          <CarouselContent className="-ml-3 md:-ml-4">
            {items.map(item => (
              <CarouselItem
                key={item.id}
                className="h-fit basis-1/3 pl-3 md:basis-1/4 md:pl-4 lg:basis-1/6"
              >
                <MediaPosterCard
                  to={buildTmdbDetailPath(item.mediaType, item.id)}
                  posterUrl={getPosterUrl(item.posterPath, 'w342')}
                  title={item.title}
                  year={item.releaseDate ? item.releaseDate.split('-')[0] : undefined}
                  rating={item.voteAverage}
                />
              </CarouselItem>
            ))}
          </CarouselContent>

          {/* 导航按钮 - 磨砂玻璃圆钮 */}
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
