import type { DetailInfoField } from './types'
import { cn } from '@/shared/lib/utils'

interface DetailInfoGridProps {
  fields: DetailInfoField[]
  className?: string
}

export function DetailInfoGrid({ fields, className }: DetailInfoGridProps) {
  return (
    <div className={cn('grid gap-2.5 sm:gap-3', className)}>
      {fields.map(field => (
        <div
          key={field.label}
          className="group rounded-xl border border-border/40 bg-card/30 p-3 sm:p-3.5 backdrop-blur-xs transition-colors hover:border-border/70 hover:bg-card/50 shadow-2xs"
        >
          <p className="text-[11px] sm:text-xs font-medium text-muted-foreground tracking-wide">{field.label}</p>
          <p className="mt-1 text-xs sm:text-sm font-semibold text-foreground/95 break-all tracking-tight leading-snug">
            {field.value}
          </p>
        </div>
      ))}
    </div>
  )
}
