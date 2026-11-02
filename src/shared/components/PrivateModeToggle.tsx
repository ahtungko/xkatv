import { EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { usePrivateModeStore } from '@/shared/store'
import { cn } from '@/shared/lib'

interface PrivateModeToggleProps {
  className?: string
  showTextOnActive?: boolean
}

export function PrivateModeToggle({ className, showTextOnActive = true }: PrivateModeToggleProps) {
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  const togglePrivateMode = usePrivateModeStore(state => state.togglePrivateMode)

  const handleToggle = () => {
    const next = togglePrivateMode()
    if (next) {
      toast.info('已开启无痕模式：不保存站内记录；浏览器和视频源仍可能记录访问')
    } else {
      toast.info('已退出无痕模式，恢复正常记录')
    }
  }

  if (isPrivateMode) {
    return (
      <button
        type="button"
        onClick={handleToggle}
        aria-label="退出无痕模式"
        title="无痕模式生效中（点击退出）"
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/15 px-2 sm:px-2.5 text-xs font-medium text-purple-300 shadow-xs transition-all hover:bg-purple-500/25',
          className,
        )}
      >
        <EyeOff className="size-3.5 text-purple-400 shrink-0" />
        {showTextOnActive && <span className="hidden sm:inline">无痕</span>}
      </button>
    )
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={handleToggle}
      className={cn('size-8 rounded-full text-muted-foreground hover:text-foreground', className)}
      aria-label="开启无痕模式"
      title="开启无痕模式（不记录观影与搜索）"
    >
      <EyeOff className="size-4" />
    </Button>
  )
}
