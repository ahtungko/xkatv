import { useEffect, useState, type ReactNode } from 'react'
import { Wrench } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { XkaLogo } from '@/shared/components/icons'
import AdminEntry from '@/shared/components/AdminEntry'
import { useAuthStore } from '@/shared/store/authStore'
import { LoadingFallback } from '@/app/router/LoadingFallback'
import {
  maintenanceIsActive,
  readMaintenance,
  readPublicMaintenance,
  type MaintenanceStatus,
} from './maintenance'

function MaintenanceCountdown({
  endsAt,
  serverTime,
  receivedAt,
}: {
  endsAt: string
  serverTime: string
  receivedAt: number
}) {
  const [, tick] = useState(0)
  useEffect(() => {
    const update = () => tick(value => value + 1)
    const interval = window.setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  const serverNow = Date.parse(serverTime) + performance.now() - receivedAt
  const seconds = Math.ceil((Date.parse(endsAt) - serverNow) / 1000)
  const remaining = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const days = Math.floor(remaining / 86400)
  const time = [
    Math.floor((remaining % 86400) / 3600),
    Math.floor((remaining % 3600) / 60),
    remaining % 60,
  ]
    .map(value => String(value).padStart(2, '0'))
    .join(':')

  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-sm">预计恢复倒计时</p>
      <p
        role="timer"
        aria-label="预计恢复倒计时"
        className="text-3xl leading-tight font-semibold tracking-tight break-words tabular-nums sm:text-4xl"
      >
        {days > 0 && `${days} 天 `}
        {time}
      </p>
    </div>
  )
}

function VisitorMaintenanceGuard({
  ownerId,
  children,
}: {
  ownerId: string | null
  children: ReactNode
}) {
  const [snapshot, setSnapshot] = useState<{
    status: MaintenanceStatus
    receivedAt: number
  } | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [, tick] = useState(0)

  useEffect(() => {
    let stopped = false
    let pending = false
    let request: AbortController | undefined
    const load = async () => {
      if (pending || stopped) return
      pending = true
      request = new AbortController()
      const timeout = window.setTimeout(() => request?.abort(), 8000)
      try {
        const status = ownerId
          ? await readMaintenance(ownerId, request.signal)
          : await readPublicMaintenance(request.signal)
        if (!stopped) {
          setSnapshot({ status, receivedAt: performance.now() })
          setError('')
        }
      } catch {
        if (!stopped) setError('暂时无法确认网站状态，请重试或联系管理员')
      } finally {
        pending = false
        window.clearTimeout(timeout)
      }
    }
    const visible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    void load()
    const interval = window.setInterval(visible, 15_000)
    window.addEventListener('focus', visible)
    window.addEventListener('online', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      stopped = true
      request?.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', visible)
      window.removeEventListener('online', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [ownerId, refresh])

  useEffect(() => {
    const window = snapshot?.status.maintenance
    if (!snapshot || !window) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const now = Date.parse(snapshot.status.server_time) + performance.now() - snapshot.receivedAt
      const next = [Date.parse(window.starts_at), Date.parse(window.ends_at)].find(
        time => time > now,
      )
      if (next === undefined) return
      timer = setTimeout(
        () => {
          tick(value => value + 1)
          schedule()
        },
        Math.max(1, Math.min(next - now, 2_147_483_647)),
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [snapshot])

  const serverNow = snapshot
    ? Date.parse(snapshot.status.server_time) + performance.now() - snapshot.receivedAt
    : 0
  const active = snapshot && maintenanceIsActive(snapshot.status, serverNow)
  if (snapshot && !error && !active) return <>{children}</>
  if (!snapshot && !error) return <LoadingFallback />
  const maintenance = active ? snapshot.status.maintenance : null

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
      <main
        className="w-full max-w-xl min-w-0 overflow-hidden rounded-2xl border shadow-sm"
        aria-label="网站维护状态"
      >
        <header className="flex items-center justify-between gap-4 border-b px-5 py-4 sm:px-8">
          <AdminEntry>
            <XkaLogo size={32} />
          </AdminEntry>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Wrench className="size-3.5" aria-hidden="true" />
            维护通知
          </span>
        </header>
        <div className="min-w-0 space-y-5 p-5 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {maintenance ? '系统维护' : error ? '暂时无法连接网站' : '正在检查网站状态…'}
          </h1>
          {maintenance && snapshot && (
            <>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {ownerId
                  ? '维护结束后自动恢复访问，无需重新登录。'
                  : '维护结束后将自动显示登录入口。'}
              </p>
              <section
                className="space-y-4 rounded-xl border bg-amber-500/5 p-4 sm:p-5"
                aria-label="维护时间"
              >
                <MaintenanceCountdown
                  endsAt={maintenance.ends_at}
                  serverTime={snapshot.status.server_time}
                  receivedAt={snapshot.receivedAt}
                />
                <dl className="grid min-w-0 gap-3 border-t pt-4 text-sm sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <dt className="text-muted-foreground text-xs">开始时间</dt>
                    <dd className="break-words">
                      {new Date(maintenance.starts_at).toLocaleString()}
                    </dd>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <dt className="text-muted-foreground text-xs">预计结束</dt>
                    <dd className="break-words">
                      {new Date(maintenance.ends_at).toLocaleString()}
                    </dd>
                  </div>
                </dl>
                <p className="text-muted-foreground text-xs">时间按当前设备时区显示</p>
              </section>
              {maintenance.content.trim() && (
                <section aria-label="维护说明" className="min-w-0 space-y-2">
                  <h2 className="text-muted-foreground text-xs font-medium">维护说明</h2>
                  <div
                    role="region"
                    aria-label="维护说明正文"
                    tabIndex={0}
                    className="max-h-[min(28dvh,14rem)] overflow-y-auto overscroll-contain rounded-lg border p-3 text-sm leading-7 [overflow-wrap:anywhere] whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                  >
                    {maintenance.content}
                  </div>
                </section>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap">
            <Button variant="outline" onClick={() => setRefresh(value => value + 1)}>
              重新检查
            </Button>
            {ownerId && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  setLogoutError('')
                  void useAuthStore
                    .getState()
                    .logout()
                    .catch(() => setLogoutError('退出失败，请稍后重试'))
                    .finally(() => setBusy(false))
                }}
              >
                退出账号
              </Button>
            )}
          </div>
          {logoutError && (
            <p role="alert" className="text-destructive text-sm">
              {logoutError}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

export function MaintenanceGuard({ children }: { children: ReactNode }) {
  const account = useAuthStore(state => state.account)
  if (account?.role === 'admin') return <>{children}</>
  return (
    <VisitorMaintenanceGuard key={account?.id ?? 'guest'} ownerId={account?.id ?? null}>
      {children}
    </VisitorMaintenanceGuard>
  )
}
