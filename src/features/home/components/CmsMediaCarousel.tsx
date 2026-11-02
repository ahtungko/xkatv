import { useEffect, useState } from 'react'
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
import { useIsMobile } from '@/shared/hooks/use-mobile'
import { buildCmsPlayPath } from '@/shared/lib/routes'
import type { VideoItem } from '@xkatv/cms-core'

interface CmsMediaCarouselProps {
  /** 板块标题 */
  title: string
  /** CMS 视频数据列表 */
  items: VideoItem[]
  /** 加载状态 */
  loading?: boolean
}

/**
 * CmsMediaCarouselSkeleton - CMS 骨架屏
 */
function CmsMediaCarouselSkeleton({ title }: { title: string }) {
  const isMobile = useIsMobile()
  const skeletonCount = isMobile
    ? 3
    : typeof window !== 'undefined' && window.innerWidth < 1024
      ? 4
      : 6

  return (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground">{title}</h2>
      </div>
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
 * CmsMediaCarousel - CMS 视频卡片轮播组件
 */
export function CmsMediaCarousel({ title, items, loading = false }: CmsMediaCarouselProps) {
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
    return <CmsMediaCarouselSkeleton title={title} />
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="group/carousel relative">
      <div className="mb-3 px-1">
        <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground">{title}</h2>
      </div>
      <div className="relative">
        <Carousel opts={{ watchDrag: canDrag, slidesToScroll }} setApi={setCarouselApi}>
          <CarouselContent className="-ml-3 md:-ml-4">
            {items.map(item => (
              <CarouselItem
                key={`${item.source_code}-${item.vod_id}`}
                className="h-fit basis-1/3 pl-3 md:basis-1/4 md:pl-4 lg:basis-1/6"
              >
                <MediaPosterCard
                  to={buildCmsPlayPath(item.source_code || '', String(item.vod_id))}
                  posterUrl={item.vod_pic}
                  title={item.vod_name}
                  year={item.vod_year}
                  topRightLabel={item.vod_remarks || undefined}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
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
