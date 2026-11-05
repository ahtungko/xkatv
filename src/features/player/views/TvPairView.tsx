import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTvCastStore } from '../store/tvCastStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { useAuthStore } from '@/shared/store/authStore'
import { setGlobalTvCastEnabled } from '../services/tvCastSettingService'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
export default function TvPairView() {
  const isTvCastEnabled = useSettingStore(state => state.system.isTvCastEnabled)
  const isAdmin = useAuthStore(state => state.account?.role === 'admin')
  const { status, pin, error, connect, disconnect } = useTvCastStore()
  const navigate = useNavigate()
  useEffect(() => {
    if (status === 'connected' && (isTvCastEnabled || isAdmin)) {
      navigate('/', { replace: true })
    }
  }, [status, isTvCastEnabled, isAdmin, navigate])

  const [input, setInput] = useState(pin)

  useEffect(() => {
    if (!isTvCastEnabled && !isAdmin) {
      try {
        sessionStorage.removeItem('tv_cast_intent')
      } catch {
        /* Storage unavailable */
      }
      return
    }

    try {
      const intent = JSON.parse(sessionStorage.getItem('tv_cast_intent') || 'null')
      sessionStorage.removeItem('tv_cast_intent')
      if (intent && Date.now() - intent.time < 300000 && /^\d{4}$/.test(intent.pin)) {
        setInput(intent.pin)
        void connect(intent.pin)
        navigate('/', { replace: true })
      }
    } catch {
      /* Storage unavailable */
    }
  }, [isTvCastEnabled, isAdmin, connect, navigate])

  useEffect(() => {
    if (!isTvCastEnabled && !isAdmin && status !== 'idle') {
      disconnect()
    }
  }, [isTvCastEnabled, isAdmin, status, disconnect])
  if (!isTvCastEnabled && !isAdmin) {
    return (
      <section className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-2xl font-bold">大屏投屏暂未开放</h1>
        <p className="text-muted-foreground text-sm">
          全站大屏投屏功能已由管理员暂时关闭，请稍后再来。
        </p>
        <Button asChild className="mt-4">
          <Link to="/">返回首页</Link>
        </Button>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-md space-y-5 py-12">
      {!isTvCastEnabled && isAdmin && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
          <span>全站大屏投屏当前已对普通用户关闭（仅管理员可见预览）。</span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 border-amber-500/30 px-2 text-xs text-amber-500 hover:bg-amber-500/20"
            onClick={() => void setGlobalTvCastEnabled(true)}
          >
            一键对全员开放
          </Button>
        </div>
      )}
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
