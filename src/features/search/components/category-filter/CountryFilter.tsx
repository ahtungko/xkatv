import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { TmdbCountry, TmdbFilterOptions } from '@/shared/types/tmdb'
import { cn } from '@/shared/lib/utils'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/shared/components/ui/drawer'
import { FilterChip } from './MediaTypeFilter'
import { getCountryChineseName, POPULAR_COUNTRIES_MOBILE } from '../../constants'

interface CountryFilterProps {
  /** 国家列表 */
  countries: TmdbCountry[]
  /** 当前筛选条件 */
  filterOptions: TmdbFilterOptions
  /** 筛选条件变更回调 */
  onFilterChange: (options: Partial<TmdbFilterOptions>) => void
}

/**
 * 国家/地区筛选组件
 * 移动端显示常用国家 + 更多按钮，桌面端显示前20个国家
 */
export function CountryFilter({
  countries,
  filterOptions,
  onFilterChange,
}: CountryFilterProps) {
  const [isCountryDrawerOpen, setIsCountryDrawerOpen] = useState(false)

  // 排序国家列表，常用国家优先
  const sortedCountries = [...countries].sort((a, b) => {
    const aIndex = POPULAR_COUNTRIES_MOBILE.indexOf(a.iso_3166_1)
    const bIndex = POPULAR_COUNTRIES_MOBILE.indexOf(b.iso_3166_1)
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return getCountryChineseName(
      a.iso_3166_1,
      a.native_name,
      a.english_name,
    ).localeCompare(
      getCountryChineseName(b.iso_3166_1, b.native_name, b.english_name),
    )
  })

  // 常用国家（移动端只显示6个）
  const popularCountries = sortedCountries.filter(c =>
    POPULAR_COUNTRIES_MOBILE.includes(c.iso_3166_1),
  )
  const otherCountries = sortedCountries.filter(
    c => !POPULAR_COUNTRIES_MOBILE.includes(c.iso_3166_1),
  )

  const selectedOtherCountriesCount = filterOptions.originCountry
    ? otherCountries.filter(c => c.iso_3166_1 === filterOptions.originCountry).length
    : 0

  return (
    <>
      {/* 移动端：常用国家 + 更多按钮 */}
      <div className="md:hidden">
        <WrapFilterRow label="地区">
          <FilterChip
            label="全部"
            isSelected={!filterOptions.originCountry}
            onClick={() => onFilterChange({ originCountry: undefined })}
          />
          {popularCountries.map(country => (
            <FilterChip
              key={country.iso_3166_1}
              label={getCountryChineseName(
                country.iso_3166_1,
                country.native_name,
                country.english_name,
              )}
              isSelected={filterOptions.originCountry === country.iso_3166_1}
              onClick={() =>
                onFilterChange({ originCountry: country.iso_3166_1 })
              }
            />
          ))}
          {otherCountries.length > 0 && (
            <Drawer open={isCountryDrawerOpen} onOpenChange={setIsCountryDrawerOpen}>
              <DrawerTrigger asChild>
                <div>
                  <MoreButton
                    count={otherCountries.length}
                    isSelected={selectedOtherCountriesCount > 0}
                  />
                </div>
              </DrawerTrigger>
              <DrawerContent className="max-h-[75vh] rounded-t-3xl border-t border-border/50 bg-background/95 backdrop-blur-2xl">
                <DrawerHeader className="border-b border-border/40 pb-3">
                  <DrawerTitle className="text-base font-bold">选择地区</DrawerTitle>
                </DrawerHeader>
                <div className="overflow-y-auto p-4 sm:p-5">
                  <div className="flex flex-wrap gap-2">
                    <FilterChip
                      label="全部地区"
                      isSelected={!filterOptions.originCountry}
                      onClick={() => {
                        onFilterChange({ originCountry: undefined })
                        setIsCountryDrawerOpen(false)
                      }}
                    />
                    {sortedCountries.map(country => (
                      <FilterChip
                        key={country.iso_3166_1}
                        label={getCountryChineseName(
                          country.iso_3166_1,
                          country.native_name,
                          country.english_name,
                        )}
                        isSelected={filterOptions.originCountry === country.iso_3166_1}
                        onClick={() => {
                          onFilterChange({ originCountry: country.iso_3166_1 })
                          setIsCountryDrawerOpen(false)
                        }}
                      />
                    ))}
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </WrapFilterRow>
      </div>

      {/* 桌面端：前20个国家 */}
      <div className="hidden md:block">
        <WrapFilterRow label="地区">
          <FilterChip
            label="全部"
            isSelected={!filterOptions.originCountry}
            onClick={() => onFilterChange({ originCountry: undefined })}
          />
          {sortedCountries.slice(0, 20).map(country => (
            <FilterChip
              key={country.iso_3166_1}
              label={getCountryChineseName(
                country.iso_3166_1,
                country.native_name,
                country.english_name,
              )}
              isSelected={filterOptions.originCountry === country.iso_3166_1}
              onClick={() => onFilterChange({ originCountry: country.iso_3166_1 })}
            />
          ))}
        </WrapFilterRow>
      </div>
    </>
  )
}

/**
 * WrapFilterRow - 换行显示筛选行
 */
interface WrapFilterRowProps {
  label: string
  children: React.ReactNode
}

export function WrapFilterRow({ label, children }: WrapFilterRowProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-foreground/75 w-12 shrink-0 pt-1 text-xs sm:text-sm font-semibold tracking-wide">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap gap-1.5 sm:gap-2">{children}</div>
    </div>
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
      className={cn(
        'inline-flex items-center gap-1 shrink-0 rounded-full px-3 py-1 text-xs sm:text-[13px] font-medium transition-all duration-200 select-none active:scale-95',
        isSelected
          ? 'bg-primary text-primary-foreground font-semibold shadow-xs shadow-primary/25 border border-primary/20 scale-[1.02]'
          : 'border border-border/40 bg-card/40 text-muted-foreground hover:text-foreground hover:bg-accent/80 hover:border-border/80',
      )}
    >
      <span>更多</span>
      <span className="text-[10px] opacity-75">({count})</span>
      <ChevronRight className="size-3" />
    </button>
  )
}
