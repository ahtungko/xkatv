import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTvCastStore } from '../store/tvCastStore'
import { TvCastModal } from './TvCastModal'
import { Button } from '@/shared/components/ui/button'
export function GlobalTvCastControl() {
  const state = useTvCastStore()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    try {
      const intent = JSON.parse(sessionStorage.getItem('tv_cast_intent') || 'null')
      if (intent && Date.now() - intent.time < 300000) navigate('/cast', { replace: true })
    } catch {
      /* Storage unavailable */
    }
  }, [navigate])
  return (
    <>
      <Button
        className="fixed right-4 bottom-20 z-40 rounded-full shadow-md md:bottom-6"
        variant="secondary"
        onClick={() => (state.status === 'connected' ? setOpen(true) : navigate('/cast'))}
      >
        {state.status === 'connected'
          ? '电视遥控器'
          : state.status === 'connecting'
            ? '等待电视确认'
            : '连接电视'}
      </Button>
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
