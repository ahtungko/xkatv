import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface ExpandToggleProps {
  /** 是否展开 */
  isExpanded: boolean
  /** 切换展开状态 */
  onToggle: () => void
  className?: string
}

/**
 * ExpandToggle - 展开/收起胶囊按钮组件
 */
export function ExpandToggle({ isExpanded, onToggle, className }: ExpandToggleProps) {
  return (
    <div className={cn('flex justify-center', className)}>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-card/40 px-3.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:bg-accent/80 hover:text-foreground active:scale-95"
      >
        <span>{isExpanded ? '收起更多' : '展开更多'}</span>
        <ChevronDown className={cn('size-3.5 transition-transform duration-200', isExpanded && 'rotate-180')} />
      </button>
    </div>
  )
}
