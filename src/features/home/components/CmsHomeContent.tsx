import { useApiStore } from '@/shared/store/apiStore'
import { useCmsVideoList } from '@/shared/hooks/useCmsCore'
import type { VideoSource } from '@xkatv/cms-core'
import { ContinueWatching } from './ContinueWatching'
import { SeriesUpdates } from './SeriesUpdates'
import { CmsMediaCarousel } from './CmsMediaCarousel'
import { NavLink } from 'react-router'
import { Settings, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { useEffect, useRef, useState } from 'react'

/**
 * 单个视频源推荐列表
 * 独立组件以隔离每个源的 hook 调用
 */
function SourceCarousel({ source }: { source: VideoSource }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!source.isEnabled || visible) return
    if (!('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisible(true)
    }, { rootMargin: '600px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [source.isEnabled, visible])
  const { items, loading } = useCmsVideoList(visible ? source : null)

  if (!source.isEnabled) return null

  return (
    <div ref={ref}>
    <CmsMediaCarousel
      title={source.name}
      items={items}
      loading={!visible || loading}
    />
    </div>
  )
}

/**
 * 无视频源时的空状态
 */
function EmptySourceState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <div className="bg-muted flex size-16 items-center justify-center rounded-full">
        <Settings className="text-muted-foreground size-8" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold">暂无视频源</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          添加视频源后即可浏览推荐内容
        </p>
      </div>
      <Button asChild variant="outline">
        <NavLink to="/settings/source">
          <Plus className="size-4" />
          添加视频源
        </NavLink>
      </Button>
    </div>
  )
}

/**
 * CmsHomeContent - CMS 模式首页内容
 * 当 TMDB 未启用时作为首页内容展示
 */
export function CmsHomeContent() {
  const videoAPIs = useApiStore(state => state.videoAPIs)

  return (
    <div className="flex flex-col gap-6">
      {/* 继续观看 */}
      <ContinueWatching />
      <SeriesUpdates />
      {/* 各视频源推荐列表 */}
      {videoAPIs.length > 0 ? (
        videoAPIs.map(source => (
          <SourceCarousel key={source.id} source={source} />
        ))
      ) : (
        <EmptySourceState />
      )}
    </div>
  )
}
