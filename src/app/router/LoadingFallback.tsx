import { XkaLogo } from '@/shared/components/icons'
import { PROJECT } from '@/shared/config/project'

export function LoadingFallback() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex -translate-y-1/2 flex-col items-center justify-center gap-3">
        <XkaLogo size={80} />
        <div className="text-xl font-bold tracking-widest">{PROJECT.name}</div>
        <div className="bg-primary/20 h-1 w-30 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full w-full origin-left"
            style={{ animation: 'progress-indeterminate 1.5s infinite ease-in-out' }}
          />
        </div>
      </div>
    </div>
  )
}
