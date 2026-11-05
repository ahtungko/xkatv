import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTvCastStore } from '../store/tvCastStore'
import { TvCastModal } from './TvCastModal'
import { Tv } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/shared/components/ui/sheet'
import { Button } from '@/shared/components/ui/button'
export function GlobalTvCastControl() {
  const state = useTvCastStore()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    try {
      const intent = JSON.parse(sessionStorage.getItem('tv_cast_intent') || 'null')
      if (intent && Date.now() - intent.time < 300000 && /^\d{4}$/.test(intent.pin)) {
        sessionStorage.removeItem('tv_cast_intent')
        void useTvCastStore.getState().connect(intent.pin)
        navigate('/', { replace: true })
      }
    } catch {
      /* Storage unavailable */
    }
  }, [navigate])
  return (
    <>
      <Sheet
        open={!!state.pendingMedia}
        onOpenChange={open => {
          if (!open) state.resolveSwitch(false)
        }}
      >
        <SheetContent side="bottom" className="p-6">
          <SheetTitle>是否立即换片？</SheetTitle>
          <SheetDescription>
            电视当前正在播放《{state.remoteState.mediaTitle || '视频'}》，是否切换为《
            {state.pendingMedia?.mediaTitle}》？
          </SheetDescription>
          <Button onClick={() => state.resolveSwitch(true)}>立即换片</Button>
          <Button variant="outline" onClick={() => state.resolveSwitch(false)}>
            取消
          </Button>
        </SheetContent>
      </Sheet>
      <div className="bg-background fixed right-4 bottom-20 z-40 flex max-w-[90vw] items-center gap-2 rounded-full p-1 shadow-md md:bottom-6">
        <Button
          className="min-w-0 truncate rounded-full"
          variant="secondary"
          onClick={() => (state.status === 'connected' ? setOpen(true) : navigate('/cast'))}
        >
          <Tv className="size-4" />
          {state.status === 'connected'
            ? state.remoteState.mediaTitle
              ? `${state.remoteState.isPlaying ? '播放中' : '已暂停'} · ${state.remoteState.mediaTitle}`
              : '电视已连接'
            : state.status === 'connecting'
              ? '等待电视确认'
              : '连接电视'}
        </Button>
        {state.status === 'connected' && state.remoteState.mediaTitle && (
          <>
            <span className="text-xs tabular-nums">
              {Math.floor(state.remoteState.currentTime / 60)}:
              {String(Math.floor(state.remoteState.currentTime % 60)).padStart(2, '0')}
            </span>
            <Button size="sm" variant="ghost" onClick={() => state.command('toggle')}>
              {state.remoteState.isPlaying ? '暂停' : '播放'}
            </Button>
          </>
        )}
      </div>
      <TvCastModal
        isOpen={open}
        onClose={() => setOpen(false)}
        isCasting={state.status === 'connected'}
        connectedPin={state.pin}
        recentPins={[]}
        remoteState={state.remoteState}
        onConnect={state.connect}
        onSendCommand={state.command}
        onDisconnect={() => {
          state.disconnect()
          setOpen(false)
        }}
      />
    </>
  )
}
