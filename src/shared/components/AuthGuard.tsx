import { useEffect, useState, type ReactNode } from 'react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { XkaLogo } from '@/shared/components/icons'
import AdminEntry from '@/shared/components/AdminEntry'
import { startAuth, useAuthStore } from '@/shared/store/authStore'
import { startSync } from '@/shared/sync/service'
import { syncClient } from '@/shared/sync/client'
import { useApiStore } from '@/shared/store/apiStore'
import { MaintenanceGuard } from '@/features/announcements/MaintenanceGuard'
import { PROJECT } from '@/shared/config/project'
import { LoadingFallback } from '@/app/router/LoadingFallback'

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { account, initialized, error, login } = useAuthStore()
  const adminLogin = window.location.pathname.replace(/\/+$/, '') === '/admin/login'
  const clearRestrictedSources = useApiStore(state => state.clearRestrictedSources)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const stopSync = startSync()
    const stopAuth = startAuth()
    return () => {
      stopAuth()
      stopSync()
    }
  }, [])
  useEffect(() => {
    if (initialized && !account) clearRestrictedSources()
  }, [account, clearRestrictedSources, initialized])
  const isPartyGuestRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/party/') || window.location.pathname.startsWith('/p/'))
  if (isPartyGuestRoute || window.location.pathname.replace(/\/+$/, '') === '/tv') return <>{children}</>
  if (!initialized && !adminLogin) return <LoadingFallback />
  if (account && (!adminLogin || account.role === 'admin'))
    return <MaintenanceGuard>{children}</MaintenanceGuard>
  const loginPage = (
    <div className="bg-background flex min-h-dvh flex-col md:flex-row">
      <div className="bg-muted/40 flex flex-col items-center justify-center gap-4 px-8 py-12 md:w-1/2">
        <XkaLogo size={80} />
        <div className="text-xl font-bold tracking-widest">{PROJECT.name}</div>
        <p className="text-muted-foreground text-sm">{PROJECT.description}</p>
      </div>
      <div className="flex flex-1 items-center justify-center px-8 py-12">
        <form
          className="w-full max-w-sm space-y-5"
          onSubmit={event => {
            event.preventDefault()
            if (busy) return
            setBusy(true)
            setMessage('')
            void login(username, password)
              .then(() => {
                setPassword('')
                if (adminLogin && useAuthStore.getState().account?.role !== 'admin')
                  setMessage('此入口仅供管理员使用，请返回主站登录。')
                void useApiStore.getState().initializeEnvSources(true)
              })
              .catch(error => {
                setMessage(error instanceof Error ? error.message : '登录失败')
              })
              .finally(() => setBusy(false))
          }}
        >
          <AdminEntry adminLogin={adminLogin} />
          <div>
            <h1 className="text-2xl font-semibold">{adminLogin ? '管理员登录' : '登录账号'}</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {adminLogin
                ? '使用管理员账号进入管理中心。'
                : '使用管理员分配的账号登录，自动同步你的收藏与观看进度。'}
            </p>
          </div>
          <label className="block space-y-2 text-sm">
            <span>用户名</span>
            <Input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={32}
              value={username}
              onChange={event => setUsername(event.target.value)}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>密码</span>
            <Input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </label>
          <Button className="w-full" type="submit" disabled={busy || !initialized || !syncClient}>
            {busy || !initialized ? '正在验证…' : adminLogin ? '登录管理中心' : '登录'}
          </Button>
          {(message || error) && (
            <p role="alert" className="text-destructive text-sm">
              {message || error}
            </p>
          )}
          <p className="text-muted-foreground text-xs">没有账号或忘记密码？请联系管理员。</p>
        </form>
      </div>
    </div>
  )
  return adminLogin ? loginPage : <MaintenanceGuard>{loginPage}</MaintenanceGuard>
}
