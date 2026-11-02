import { motion } from 'framer-motion'
import { Sparkles, Zap } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export type SearchMode = 'tmdb' | 'direct'

interface SearchModeToggleProps {
  mode: SearchMode
  onChange: (mode: SearchMode) => void
  className?: string
}

/**
 * SearchModeToggle - 院线级分段胶囊切换器 (Cinema Segmented Control)
 * 用于在智能检索（TMDB）和直连搜索之间平滑切换
 */
export function SearchModeToggle({ mode, onChange, className }: SearchModeToggleProps) {
  const modes: { value: SearchMode; label: string; icon: typeof Sparkles }[] = [
    { value: 'tmdb', label: '智能检索', icon: Sparkles },
    { value: 'direct', label: '直连聚合', icon: Zap },
  ]

  return (
    <div
      className={cn(
        'relative inline-flex items-center rounded-full p-1 border border-border/50 bg-card/40 backdrop-blur-md shadow-xs',
        className,
      )}
    >
      {modes.map(({ value, label, icon: Icon }) => {
        const isSelected = mode === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              'relative z-10 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors duration-200',
              isSelected
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className={cn('size-3.5 sm:size-4 transition-colors', isSelected ? 'text-primary' : 'text-muted-foreground')} />
            <span>{label}</span>
            {isSelected && (
              <motion.div
                layoutId="search-mode-indicator"
                className="absolute inset-0 -z-10 rounded-full bg-background border border-border/50 shadow-xs"
                transition={{
                  type: 'spring',
                  stiffness: 420,
                  damping: 32,
                }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
