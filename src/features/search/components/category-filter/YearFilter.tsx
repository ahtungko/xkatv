import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { TmdbFilterOptions } from '@/shared/types/tmdb'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/shared/components/ui/drawer'
import { FilterChip } from './MediaTypeFilter'
import { WrapFilterRow } from './CountryFilter'

interface YearFilterProps {
  /** 可用年份列表 */
  years: number[]
  /** 当前筛选条件 */
  filterOptions: TmdbFilterOptions
  /** 筛选条件变更回调 */
  onFilterChange: (options: Partial<TmdbFilterOptions>) => void
}

/**
 * 年份筛选组件
 * 移动端显示前5个年份 + 更多按钮，桌面端显示10个年份
 */
export function YearFilter({ years, filterOptions, onFilterChange }: YearFilterProps) {
  const [isYearDrawerOpen, setIsYearDrawerOpen] = useState(false)

  // 移动端显示的年份（前5个）
  const mobileYears = years.length > 0 ? years.slice(0, 5) : Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  // 桌面端显示的年份（前10个或全部）
  const desktopYears = years.length > 0 ? years : Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)

  // 抽屉中显示的所有年份
  const drawerYears = years.length > 0 ? years : Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - i)

  // 计算更多按钮是否应显示选中状态
  const isMoreSelected =
    filterOptions.releaseYear !== undefined && !mobileYears.includes(filterOptions.releaseYear)

  return (
    <>
      {/* 移动端：前5个年份 + 更多按钮 */}
      <div className="md:hidden">
        <WrapFilterRow label="年份">
          <FilterChip
            label="全部"
            isSelected={!filterOptions.releaseYear}
            onClick={() => onFilterChange({ releaseYear: undefined })}
          />
          {mobileYears.map(year => (
            <FilterChip
              key={year}
              label={String(year)}
              isSelected={filterOptions.releaseYear === year}
              onClick={() => onFilterChange({ releaseYear: year })}
            />
          ))}
          <Drawer open={isYearDrawerOpen} onOpenChange={setIsYearDrawerOpen}>
            <DrawerTrigger asChild>
              <div>
                <MoreButton
                  count={Math.max(0, (years.length > 5 ? years.length - 5 : 0) || 15)}
                  isSelected={isMoreSelected}
                />
              </div>
            </DrawerTrigger>
            <DrawerContent className="max-h-[75vh] rounded-t-3xl border-t border-border/50 bg-background/95 backdrop-blur-2xl">
              <DrawerHeader className="border-b border-border/40 pb-3">
                <DrawerTitle className="text-base font-bold">选择年份</DrawerTitle>
              </DrawerHeader>
              <div className="overflow-y-auto p-4 sm:p-5">
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    label="全部年份"
                    isSelected={!filterOptions.releaseYear}
                    onClick={() => {
                      onFilterChange({ releaseYear: undefined })
                      setIsYearDrawerOpen(false)
                    }}
                  />
                  {drawerYears.map(year => (
                    <FilterChip
                      key={year}
                      label={String(year)}
                      isSelected={filterOptions.releaseYear === year}
                      onClick={() => {
                        onFilterChange({ releaseYear: year })
                        setIsYearDrawerOpen(false)
                      }}
                    />
                  ))}
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        </WrapFilterRow>
      </div>

      {/* 桌面端：前10个年份 */}
      <div className="hidden md:block">
        <WrapFilterRow label="年份">
          <FilterChip
            label="全部"
            isSelected={!filterOptions.releaseYear}
            onClick={() => onFilterChange({ releaseYear: undefined })}
          />
          {desktopYears.map(year => (
            <FilterChip
              key={year}
              label={String(year)}
              isSelected={filterOptions.releaseYear === year}
              onClick={() => onFilterChange({ releaseYear: year })}
            />
          ))}
        </WrapFilterRow>
      </div>
    </>
  )
}

interface MoreButtonProps {
  count: number
  isSelected?: boolean
}

/**
 * MoreButton - 更多胶囊按钮组件
 */
function MoreButton({ count, isSelected }: MoreButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 shrink-0 rounded-full px-3 py-1 text-xs sm:text-[13px] font-medium transition-all duration-200 select-none active:scale-95 ${
        isSelected
          ? 'bg-primary text-primary-foreground font-semibold shadow-xs shadow-primary/25 border border-primary/20 scale-[1.02]'
          : 'border border-border/40 bg-card/40 text-muted-foreground hover:text-foreground hover:bg-accent/80 hover:border-border/80'
      }`}
    >
      <span>更多</span>
      <span className="text-[10px] opacity-75">({count})</span>
      <ChevronRight className="size-3" />
    </button>
  )
}
