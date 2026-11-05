import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTvCastStore } from '../store/tvCastStore'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
export default function TvPairView() {
  const { status, pin, error, connect, disconnect } = useTvCastStore()
  const [input, setInput] = useState(pin)
  useEffect(() => {
    try {
      const intent = JSON.parse(sessionStorage.getItem('tv_cast_intent') || 'null')
      sessionStorage.removeItem('tv_cast_intent')
      if (intent && Date.now() - intent.time < 300000 && /^\d{4}$/.test(intent.pin)) {
        setInput(intent.pin)
        void connect(intent.pin)
      }
    } catch {
      /* Storage unavailable */
    }
  }, [connect])
  return (
    <section className="mx-auto max-w-md space-y-5 py-12">
      <h1 className="text-2xl font-bold">连接电视</h1>
      {status === 'connected' ? (
        <>
          <p>已连接电视 {pin}，电视正在等待选片。</p>
          <Button asChild>
            <Link to="/">去选片</Link>
          </Button>
          <p className="text-muted-foreground text-sm">选好视频后，在播放器点击「在电视播放」。</p>
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault()
            void connect(input)
          }}
        >
          <p>在电视浏览器打开 /tv，然后输入屏幕上的配对码。</p>
          <Input
            aria-label="电视配对码"
            value={input}
            onChange={e => setInput(e.target.value)}
            inputMode="numeric"
            maxLength={4}
            disabled={status === 'connecting'}
          />
          <Button disabled={status === 'connecting' || !/^\d{4}$/.test(input)} type="submit">
            {status === 'connecting' ? '等待电视确认…' : '连接电视'}
          </Button>
          {status === 'connecting' && <p>请用电视遥控器选择「允许投屏」。</p>}
        </form>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {status !== 'idle' && (
        <Button variant="outline" onClick={disconnect}>
          取消 / 断开连接
        </Button>
      )}
    </section>
  )
}
