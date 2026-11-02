import { Play, Star } from 'lucide-react'
import { NavLink } from 'react-router'
import { AspectRatio } from '@/shared/components/ui/aspect-ratio'
import type { SourceColorScheme } from '@/shared/lib/source-colors'

interface MediaPosterCardProps {
  /** 链接地址 */
  to: string
  /** 海报图片 URL */
  posterUrl?: string | null
  /** 标题 */
  title: string
  /** 海报比例，默认 2/3 */
  aspectRatio?: number
  /** 是否显示标题，默认 true */
  showTitle?: boolean
  /** 年份 - 显示在左上角 */
  year?: string | number
  /** 右上角标签 */
  topRightLabel?: string
  /** 右上角标签配色方案（不传则使用默认黄色） */
  topRightLabelColorScheme?: SourceColorScheme
  /** 评分 (0-10) - 显示在右下角 */
  rating?: number
}

/**
 * MediaPosterCard - 院线级极简海报卡片 (Cinema Obsidian Poster Card)
 * 具备微悬浮上浮、柔和光影阴影、磨砂徽标与平滑播放按钮
 */
export function MediaPosterCard({
  to,
  posterUrl,
  title,
  aspectRatio = 2 / 3,
  showTitle = true,
  year,
  topRightLabel,
  topRightLabelColorScheme,
  rating,
}: MediaPosterCardProps) {
  // 使用自定义配色或默认配色
  const labelColor = topRightLabelColorScheme || { bg: '250, 204, 21', text: '120, 53, 15' }

  const labelStyle = {
    backgroundColor: `rgb(${labelColor.bg})`,
    color: `rgb(${labelColor.text})`,
  }

  return (
    <NavLink to={to} className="group block focus-visible:outline-none">
      <div className="relative">
        {/* 海报卡片容器 */}
        <div className="relative overflow-hidden rounded-xl border border-border/40 bg-card/30 shadow-sm transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:border-white/20 group-hover:shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
          <AspectRatio ratio={aspectRatio} className="bg-muted">
            {posterUrl ? (
              <img
                className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                src={posterUrl}
                alt={title}
                loading="lazy"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-muted">
                <span className="text-xs font-medium text-muted-foreground">暂无封面</span>
              </div>
            )}

            {/* 上下暗色渐变遮罩，保障标签可读性 */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-300 group-hover:opacity-0" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300 group-hover:opacity-0" />

            {/* 左上角年份徽标 */}
            {year && (
              <div className="absolute left-1.5 top-1.5 rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-md shadow-sm transition-opacity duration-300 group-hover:opacity-0">
                {year}
              </div>
            )}

            {/* 右上角来源或备注标签 */}
            {topRightLabel && (
              <div
                className="absolute right-0 top-0 rounded-bl-lg rounded-tr-lg px-2 py-0.5 text-[10px] font-semibold shadow-md transition-opacity duration-300 group-hover:opacity-0"
                style={labelStyle}
              >
                {topRightLabel}
              </div>
            )}

            {/* 右下角评分徽标 */}
            {rating !== undefined && rating > 0 && (
              <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-md border border-amber-400/25 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur-md shadow-sm transition-opacity duration-300 group-hover:opacity-0">
                <Star className="size-2.5 fill-amber-400 text-amber-400" />
                <span>{rating.toFixed(1)}</span>
              </div>
            )}
          </AspectRatio>

          {/* Hover 态：柔和暗化遮罩 + 播放按钮 */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="flex size-11 items-center justify-center rounded-full bg-white text-black shadow-2xl transition-transform duration-300 ease-out transform scale-90 group-hover:scale-100">
              <Play className="size-5 fill-current ml-0.5" />
            </div>
          </div>
        </div>

        {/* 标题 */}
        {showTitle && (
          <div className="mt-2.5 px-0.5">
            <p className="line-clamp-1 text-sm font-medium text-foreground/90 transition-colors duration-200 group-hover:text-primary">
              {title}
            </p>
          </div>
        )}
      </div>
    </NavLink>
  )
}
