import { cn } from '@/shared/lib/utils'
import type { TmdbFilterOptions } from '@/shared/types/tmdb'
import { MEDIA_TYPE_LABELS, MEDIA_TYPE_OPTIONS } from '../../constants'

interface MediaTypeFilterProps {
  /** 当前筛选条件 */
  filterOptions: TmdbFilterOptions
  /** 筛选条件变更回调 */
  onFilterChange: (options: Partial<TmdbFilterOptions>) => void
  className?: string
}

/**
 * 媒体类型筛选组件（全部/电影/剧集）
 */
export function MediaTypeFilter({
  filterOptions,
  onFilterChange,
  className,
}: MediaTypeFilterProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="text-foreground/75 w-12 shrink-0 text-xs sm:text-sm font-semibold tracking-wide">
        类型
      </span>
      <div className="flex flex-1 flex-wrap gap-1.5 sm:gap-2">
        {MEDIA_TYPE_OPTIONS.map(type => (
          <FilterChip
            key={type}
            label={MEDIA_TYPE_LABELS[type]}
            isSelected={
              filterOptions.mediaType === type || (!filterOptions.mediaType && type === 'all')
            }
            onClick={() =>
              onFilterChange({ mediaType: type === 'all' ? undefined : type })
            }
          />
        ))}
      </div>
    </div>
  )
}

interface FilterChipProps {
  label: string
  isSelected: boolean
  onClick: () => void
  count?: number
}

/**
 * FilterChip - 筛选胶囊标签组件 (Pill Chip)
 */
export function FilterChip({ label, isSelected, onClick, count }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 shrink-0 rounded-full px-3 py-1 text-xs sm:text-[13px] font-medium transition-all duration-200 select-none active:scale-95',
        isSelected
          ? 'bg-primary text-primary-foreground font-semibold shadow-xs shadow-primary/25 border border-primary/20 scale-[1.02]'
          : 'border border-border/40 bg-card/40 text-muted-foreground hover:text-foreground hover:bg-accent/80 hover:border-border/80',
      )}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] rounded-full bg-primary/20 px-1 py-0.2">
          {count}
        </span>
      )}
    </button>
  )
}
