import { ArrowUpDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import type { TmdbFilterOptions } from '@/shared/types/tmdb'
import { RATING_OPTIONS, SORT_OPTIONS } from '../../constants'

interface AdvancedFilterProps {
  /** 当前筛选条件 */
  filterOptions: TmdbFilterOptions
  /** 筛选条件变更回调 */
  onFilterChange: (options: Partial<TmdbFilterOptions>) => void
}

/**
 * 高级筛选组件（评分和排序）
 */
export function AdvancedFilter({
  filterOptions,
  onFilterChange,
}: AdvancedFilterProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-foreground/75 w-12 shrink-0 text-xs sm:text-sm font-semibold tracking-wide">
        更多
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-3">
        {/* 评分筛选 */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs sm:text-sm font-medium">评分</span>
          <Select
            value={String(filterOptions.minVoteAverage || 0)}
            onValueChange={value =>
              onFilterChange({ minVoteAverage: Number(value) || undefined })
            }
          >
            <SelectTrigger className="h-7.5 w-[92px] rounded-full text-xs border-border/40 bg-card/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/40">
              {RATING_OPTIONS.map(option => (
                <SelectItem key={option.value} value={String(option.value)} className="rounded-lg text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 排序筛选 */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs sm:text-sm font-medium">排序</span>
          <Select
            value={filterOptions.sortBy || 'default'}
            onValueChange={value =>
              onFilterChange({
                sortBy:
                  value === 'default' ? undefined : (value as TmdbFilterOptions['sortBy']),
              })
            }
          >
            <SelectTrigger className="h-7.5 w-[96px] rounded-full text-xs border-border/40 bg-card/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/40">
              {SORT_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value} className="rounded-lg text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="size-7.5 rounded-full border border-border/40 bg-card/40 hover:bg-accent/80"
            onClick={() =>
              onFilterChange({
                sortOrder: filterOptions.sortOrder === 'asc' ? 'desc' : 'asc',
              })
            }
            title={filterOptions.sortOrder === 'asc' ? '当前升序，点击切换降序' : '当前降序，点击切换升序'}
          >
            <ArrowUpDown
              className={cn(
                'size-3.5 transition-transform duration-200',
                filterOptions.sortOrder === 'asc' && 'rotate-180',
              )}
            />
          </Button>
        </div>
      </div>
    </div>
  )
}
