import { useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, Play, Info, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import Autoplay from 'embla-carousel-autoplay'
import { NavLink, useNavigate } from 'react-router'

import { getBackdropUrl, getLogoUrl, getTmdbClient } from '@/shared/lib/tmdb'
import { buildTmdbDetailPath, buildTmdbPlayPath } from '@/shared/lib/routes'
import { buildHistoryPlayPath, isTmdbHistoryItem } from '@/shared/lib/viewingHistory'
import { Button } from '@/shared/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/shared/components/ui/carousel'
import { AspectRatio } from '@/shared/components/ui/aspect-ratio'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useIsMobile } from '@/shared/hooks/use-mobile'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import type { TmdbMediaItem } from '@/shared/types/tmdb'
import type { ViewingHistoryItem } from '@/shared/types/video'

const emptyHistory: ViewingHistoryItem[] = []

// 平板断点 (768px - 1024px)
const TABLET_BREAKPOINT = 1024

function useIsTablet() {
  const [isTablet, setIsTablet] = useState<boolean>(false)

  useEffect(() => {
    const checkTablet = () => {
      const width = window.innerWidth
      setIsTablet(width >= 768 && width < TABLET_BREAKPOINT)
    }

    checkTablet()
    window.addEventListener('resize', checkTablet)
    return () => window.removeEventListener('resize', checkTablet)
  }, [])

  return isTablet
}

interface FeaturedCarouselProps {
  items: TmdbMediaItem[]
  loading?: boolean
  autoplayDelay?: number
}

/**
 * FeaturedCarousel - 院线级巨幕全景轮播图 (Cinema Obsidian Hero Banner)
 * 采用专业电影暗场遮罩，无论在深色模式（Dark）还是浅色模式（Day）下，
 * 均始终保持 OLED 级高对比度与清晰度，彻底杜绝浅色模式下的白雾遮挡。
 */
export function FeaturedCarousel({
  items,
  loading = false,
  autoplayDelay = 5500,
}: FeaturedCarouselProps) {
  const navigate = useNavigate()
  const [api, setApi] = useState<CarouselApi>()
  const [activeIndex, setActiveIndex] = useState(0)
  const [logos, setLogos] = useState<Record<string, string | null>>({})
  const activeItem = items[activeIndex]
  const activeKey = activeItem ? `${activeItem.mediaType}-${activeItem.id}` : null
  useEffect(() => {
    if (!activeItem || !activeKey || activeKey in logos) return
    let cancelled = false
    const client = getTmdbClient()
    const request = activeItem.mediaType === 'movie'
      ? client.movies.images(activeItem.id, { include_image_language: ['zh', 'en', 'null'] })
      : client.tvShows.images(activeItem.id, { include_image_language: ['zh', 'en', 'null'] })
    void request.then(images => {
      if (cancelled) return
      const choices = images.logos || []
      const logo = choices.find(l => l.iso_639_1 === 'zh') || choices.find(l => l.iso_639_1 === 'en') || choices.find(l => !l.iso_639_1) || choices[0]
      setLogos(current => ({ ...current, [activeKey]: logo?.file_path ?? null }))
    }).catch(() => {
      if (!cancelled) setLogos(current => ({ ...current, [activeKey]: null }))
    })
    return () => { cancelled = true }
  }, [activeItem, activeKey, logos])
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  const viewingHistory = useViewingHistoryStore(state => isPrivateMode ? emptyHistory : state.viewingHistory)

  const latestTmdbHistoryMap = useMemo(() => {
    const latestHistoryMap = new Map<string, ViewingHistoryItem>()
    if (isPrivateMode) return latestHistoryMap
    const latestMappedHistoryMap = new Map<string, ViewingHistoryItem>()

    viewingHistory.forEach(historyItem => {
      if (!isTmdbHistoryItem(historyItem)) return

      const mediaKey = `${historyItem.tmdbMediaType}-${historyItem.tmdbId}`
      const latestHistory = latestHistoryMap.get(mediaKey)
      const latestMappedHistory = latestMappedHistoryMap.get(mediaKey)

      if (!latestHistory || historyItem.timestamp > latestHistory.timestamp) {
        latestHistoryMap.set(mediaKey, historyItem)
      }

      if (!historyItem.sourceCode || !historyItem.vodId) return

      if (!latestMappedHistory || historyItem.timestamp > latestMappedHistory.timestamp) {
        latestMappedHistoryMap.set(mediaKey, historyItem)
      }
    })

    const resultMap = new Map<string, ViewingHistoryItem>()
    latestHistoryMap.forEach((historyItem, mediaKey) => {
      resultMap.set(mediaKey, latestMappedHistoryMap.get(mediaKey) || historyItem)
    })
    return resultMap
  }, [viewingHistory, isPrivateMode])

  // 根据设备类型获取 AspectRatio
  // 移动端: 16/10, 平板: 16/9, 桌面: 21/9 院线超宽巨幕
  const getAspectRatio = () => {
    if (isMobile) return 16 / 10
    if (isTablet) return 16 / 9
    return 21 / 9
  }

  // 监听 carousel 选择变化
  useEffect(() => {
    if (!api) return

    const onSelect = () => {
      setActiveIndex(api.selectedScrollSnap())
    }

    onSelect()
    api.on('select', onSelect)
    return () => {
      api.off('select', onSelect)
    }
  }, [api])

  // 骨架屏
  if (loading) {
    return (
      <div className="-mx-3 -mt-3 sm:mx-0 sm:mt-0 select-none overflow-hidden rounded-none sm:rounded-2xl lg:rounded-3xl bg-zinc-950 shadow-xl ring-1 ring-black/10 dark:ring-white/10">
        <AspectRatio ratio={getAspectRatio()} className="relative overflow-hidden bg-zinc-900">
          <Skeleton className="size-full rounded-none bg-zinc-800" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-6 pb-8 md:px-12 md:pb-12 lg:px-16 lg:pb-14">
            <div className="flex gap-2 mb-3">
              <Skeleton className="h-5 w-16 rounded-full bg-zinc-700" />
              <Skeleton className="h-5 w-12 rounded-full bg-zinc-700" />
            </div>
            <Skeleton className="mb-4 h-10 w-64 md:h-14 md:w-96 bg-zinc-700" />
            <Skeleton className="mb-2 h-4 w-2/3 max-w-xl bg-zinc-700" />
            <Skeleton className="mb-6 h-4 w-1/2 max-w-md bg-zinc-700" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-28 rounded-full bg-zinc-700" />
              <Skeleton className="h-10 w-28 rounded-full bg-zinc-700" />
            </div>
          </div>
        </AspectRatio>
      </div>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="group/hero relative select-none -mx-3 -mt-3 sm:mx-0 sm:mt-0 rounded-none sm:rounded-2xl lg:rounded-3xl overflow-hidden bg-zinc-950 shadow-xl ring-1 ring-black/10 dark:ring-white/10 dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
      <Carousel
        className="relative w-full overflow-hidden"
        opts={{
          align: 'start',
          loop: true,
        }}
        plugins={[
          Autoplay({
            delay: autoplayDelay,
            stopOnInteraction: false,
            stopOnMouseEnter: true,
          }),
        ]}
        setApi={setApi}
      >
        <CarouselContent className="ml-0">
          {items.map((item, index) => {
            const isActive = index === activeIndex
            const playPath = buildTmdbPlayPath(item.mediaType, item.id)
            const detailPath = buildTmdbDetailPath(item.mediaType, item.id)
            const latestTmdbHistory = latestTmdbHistoryMap.get(`${item.mediaType}-${item.id}`)
            const continueWatchingLabel = latestTmdbHistory
              ? latestTmdbHistory.episodeName || `第${latestTmdbHistory.episodeIndex + 1}集`
              : ''
            const continueWatchingProgressLabel = latestTmdbHistory
              ? latestTmdbHistory.duration > 0
                ? `已看 ${Math.round(
                    Math.min(
                      100,
                      Math.max(
                        0,
                        (latestTmdbHistory.playbackPosition / latestTmdbHistory.duration) * 100,
                      ),
                    ),
                  )}%`
                : '已看'
              : ''
            const continueWatchingPath = latestTmdbHistory
              ? latestTmdbHistory.sourceCode && latestTmdbHistory.vodId
                ? buildHistoryPlayPath(latestTmdbHistory)
                : buildTmdbPlayPath(item.mediaType, item.id, {
                    episodeIndex: latestTmdbHistory.episodeIndex,
                    seasonNumber:
                      item.mediaType === 'tv'
                        ? latestTmdbHistory.tmdbSeasonNumber ?? undefined
                        : undefined,
                  })
              : ''
            const playNowLabel = continueWatchingPath ? '从头播放' : '立即播放'
            const releaseYear = item.releaseDate ? item.releaseDate.split('-')[0] : null
            const typeLabel = item.mediaType === 'movie' ? '电影' : '剧集'
            const ratingScore = item.voteAverage > 0 ? item.voteAverage.toFixed(1) : null

            return (
              <CarouselItem
                key={`${item.mediaType}-${item.id}`}
                className="relative pl-0 w-full shrink-0"
              >
                <AspectRatio ratio={getAspectRatio()} className="relative overflow-hidden bg-zinc-950">
                  {/* 背景海报大图 */}
                  <img
                    className="size-full object-cover object-center md:object-top transition-transform duration-1000 ease-out"
                    src={getBackdropUrl(item.backdropPath)}
                    alt={item.title}
                    loading={index === 0 ? 'eager' : 'lazy'}
                  />

                  {/* 电影级暗场渐变遮罩 (Cinema Obsidian Dark Masks) - 无论日间还是夜间均保持高对比度与画质，杜绝白雾 */}
                  {/* 1. 顶部微弱暗角 (增强状态栏/顶栏可读性) */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 via-black/20 to-transparent" />

                  {/* 2. 左侧深层电影暗场渐变 (保证标题、梗概与按钮对比度 100% 锐利清晰) */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/95 via-black/75 via-45% to-transparent lg:via-black/70 lg:via-50%" />

                  {/* 3. 底部平滑溶解渐变 */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/90 via-black/45 via-35% to-transparent dark:from-background dark:via-background/75" />

                  {/* 内容展示区 - 纯白高对比文字与磨砂徽标 */}
                  <div
                    className={`absolute inset-0 flex flex-col justify-end px-5 pb-6 transition-all duration-700 ease-out sm:px-8 sm:pb-8 md:px-12 md:pb-10 lg:px-16 lg:pb-12 ${
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                    }`}
                  >
                    {/* 元数据标签徽章 */}
                    <div className="mb-2.5 flex flex-wrap items-center gap-2 md:mb-3.5">
                      <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-white/95 backdrop-blur-md">
                        {typeLabel}
                      </span>
                      {releaseYear && (
                        <span className="text-xs font-medium text-white/80">{releaseYear}</span>
                      )}
                      {ratingScore && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/35 bg-black/40 px-2.5 py-0.5 text-[11px] font-bold text-amber-400 backdrop-blur-md">
                          <Star className="size-3 fill-amber-400 text-amber-400" />
                          {ratingScore}
                        </span>
                      )}
                    </div>

                    {/* Logo 图片或主标题 */}
                    <div className="mb-3 flex items-end md:mb-4">
                      {logos[`${item.mediaType}-${item.id}`] ? (
                        <img
                          src={getLogoUrl(logos[`${item.mediaType}-${item.id}`])}
                          alt={item.title}
                          className="max-h-12 max-w-[200px] object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] sm:max-h-16 sm:max-w-[260px] md:max-h-24 md:max-w-md lg:max-h-28 lg:max-w-lg"
                        />
                      ) : (
                        <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-3xl md:text-5xl lg:text-6xl">
                          {item.title}
                        </h1>
                      )}
                    </div>

                    {/* 故事梗概 */}
                    <p className="mb-5 line-clamp-2 max-w-md text-xs leading-relaxed text-white/85 drop-shadow-sm sm:text-sm md:line-clamp-3 md:max-w-xl md:text-base lg:max-w-2xl">
                      {item.overview}
                    </p>

                    {/* 交互按钮栏 */}
                    <div className="flex items-center gap-2.5 sm:gap-3.5">
                      {isMobile ? (
                        <>
                          <Button
                            size="sm"
                            className="h-9 flex-1 gap-1.5 rounded-full bg-white font-semibold text-black shadow-lg shadow-black/40 transition-all hover:bg-white/90 active:scale-95"
                            onClick={() => navigate(continueWatchingPath || playPath)}
                          >
                            <Play className="size-4 fill-current" />
                            <span>{continueWatchingPath ? '继续观看' : playNowLabel}</span>
                          </Button>

                          {continueWatchingPath ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-9 shrink-0 gap-1 rounded-full border border-white/20 bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/25 active:scale-95"
                                >
                                  <MoreHorizontal className="size-4" />
                                  <span>更多</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuItem onClick={() => navigate(playPath)}>
                                  <Play className="size-3.5" />
                                  <span>{playNowLabel}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(detailPath)}>
                                  <Info className="size-3.5" />
                                  <span>查看详情</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-9 shrink-0 gap-1 rounded-full border border-white/20 bg-white/15 px-3.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/25 active:scale-95"
                              onClick={() => navigate(detailPath)}
                            >
                              <Info className="size-4" />
                              <span>详情</span>
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          {continueWatchingPath ? (
                            <Button
                              asChild
                              size="lg"
                              className="group relative h-11 gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:brightness-110 active:scale-98"
                            >
                              <NavLink to={continueWatchingPath} className="relative inline-flex items-center">
                                <Play className="size-4.5 fill-current" />
                                <span>继续观看</span>
                                {continueWatchingLabel ? (
                                  <span className="opacity-90">· {continueWatchingLabel}</span>
                                ) : null}
                                {continueWatchingProgressLabel ? (
                                  <span className="ml-1.5 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    {continueWatchingProgressLabel}
                                  </span>
                                ) : null}
                              </NavLink>
                            </Button>
                          ) : null}

                          <Button
                            asChild
                            size="lg"
                            className="h-11 gap-2 rounded-full bg-white px-6 font-semibold text-black shadow-xl shadow-black/40 transition-all hover:bg-white/90 hover:scale-[1.02] active:scale-98"
                          >
                            <NavLink to={playPath}>
                              <Play className="size-4.5 fill-current" />
                              <span>{playNowLabel}</span>
                            </NavLink>
                          </Button>

                          <Button
                            asChild
                            size="lg"
                            variant="secondary"
                            className="h-11 gap-2 rounded-full border border-white/20 bg-white/15 px-6 font-semibold text-white backdrop-blur-md transition-all hover:bg-white/25 hover:border-white/35 active:scale-98"
                          >
                            <NavLink to={detailPath}>
                              <Info className="size-4.5" />
                              <span>查看详情</span>
                            </NavLink>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </AspectRatio>
              </CarouselItem>
            )
          })}
        </CarouselContent>

        {/* 桌面端悬浮翻页左右键 */}
        <button
          type="button"
          aria-label="上一页"
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 hidden size-11 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-md opacity-0 shadow-lg transition-all duration-300 hover:bg-black/80 hover:scale-105 active:scale-95 lg:flex lg:group-hover/hero:opacity-100"
          onClick={() => api?.scrollPrev()}
        >
          <ChevronLeft className="size-5" />
        </button>

        <button
          type="button"
          aria-label="下一页"
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 hidden size-11 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-md opacity-0 shadow-lg transition-all duration-300 hover:bg-black/80 hover:scale-105 active:scale-95 lg:flex lg:group-hover/hero:opacity-100"
          onClick={() => api?.scrollNext()}
        >
          <ChevronRight className="size-5" />
        </button>

        {/* 底部轮播进度指示条 (Apple TV+ 指示器风格) */}
        <div className="absolute bottom-3 right-5 z-20 flex items-center gap-1.5 sm:bottom-4 sm:right-8 md:bottom-5 md:right-12 lg:bottom-5 lg:right-16">
          {items.map((_, dotIndex) => (
            <button
              key={dotIndex}
              type="button"
              aria-label={`切换到第 ${dotIndex + 1} 张`}
              onClick={() => api?.scrollTo(dotIndex)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                dotIndex === activeIndex
                  ? 'w-7 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]'
                  : 'w-2 bg-white/35 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      </Carousel>
    </div>
  )
}
