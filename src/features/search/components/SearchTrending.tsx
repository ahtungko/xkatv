import { TrendingUp, Flame } from 'lucide-react'
import { motion } from 'framer-motion'
import { type TmdbMediaItem } from '@/shared/types/tmdb'
import { Skeleton } from '@/shared/components/ui/skeleton'

interface SearchTrendingProps {
  trending: TmdbMediaItem[]
  onSearch: (query: string) => void
  disabled?: boolean
  isLoading?: boolean
  className?: string
}

export function SearchTrending({ trending, onSearch, className = '', isLoading }: SearchTrendingProps) {
  if (isLoading) {
    const skeletonWidths = [
      'w-20', 'w-16', 'w-24', 'w-14', 'w-20', 'w-16', 'w-24', 'w-14',
      'w-16', 'w-20', 'w-14', 'w-24', 'w-16', 'w-20', 'w-14', 'w-24'
    ]

    return (
      <motion.div
        className={`w-full max-w-2xl px-2 sm:px-0 ${className}`}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="text-primary size-4" />
          <span className="text-muted-foreground text-xs sm:text-sm font-medium">全网热搜</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {skeletonWidths.map((widthClass, index) => (
            <Skeleton key={index} className={`h-8 ${widthClass} rounded-full`} />
          ))}
        </div>
      </motion.div>
    )
  }

  if (trending.length === 0) return null

  return (
    <motion.div
      className={`w-full max-w-2xl px-2 sm:px-0 ${className}`}
      initial={{ opacity: 0, y: 15, height: 0 }}
      animate={{ 
        opacity: 1, 
        y: 0, 
        height: 'auto',
        transition: { duration: 0.3, delay: 0.15 }
      }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
    >
      <div className="flex items-center gap-1.5 mb-3 px-1">
        <Flame className="text-amber-500 size-4" />
        <span className="text-foreground/80 text-xs sm:text-sm font-semibold tracking-wide">大家都在看</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {trending.map((item, index) => {
          const rank = index + 1
          return (
            <button
              key={item.id}
              type="button"
              className="group inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/40 backdrop-blur-sm px-3.5 py-1.5 text-xs sm:text-sm font-medium text-foreground transition-all duration-200 hover:bg-accent/80 hover:border-border/80 hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => onSearch(item.title)}
            >
              <span
                className={`flex size-4 items-center justify-center rounded-full text-[10px] font-bold ${
                  rank === 1
                    ? 'bg-amber-500/20 text-amber-500'
                    : rank === 2
                      ? 'bg-slate-400/20 text-slate-400'
                      : rank === 3
                        ? 'bg-amber-700/20 text-amber-600 dark:text-amber-500'
                        : 'text-muted-foreground/60'
                }`}
              >
                {rank}
              </span>
              <span className="truncate max-w-[140px] sm:max-w-[200px]">{item.title}</span>
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}
