import { useState } from 'react'
import { Cloud } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { importDeviceCollection, syncNow, useSyncStatus } from '@/shared/sync/service'
import { useAuthStore } from '@/shared/store/authStore'
import { SettingsSection } from './common'
import { syncSeriesNotificationsNow } from '@/shared/sync/seriesNotifications'
import { useSeriesNotificationsStore } from '@/features/favorites/store/seriesNotificationsStore'

export default function CloudSync() {
  const state = useSyncStatus()
  const reminders = useSeriesNotificationsStore()
  const { account, logout, error } = useAuthStore()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return (
    <>
      <SettingsSection
        title="账号与云同步"
        icon={<Cloud className="size-4" />}
        tone="sky"
        description="登录后自动同步收藏、观看进度、追更新集提醒与播放/搜索偏好。各账号的数据相互独立。"
      >
        <div className="space-y-3">
          <p className="text-sm">
            {account?.username} · {account?.role === 'admin' ? '管理员' : '用户'}
          </p>
          {reminders.syncOwner === account?.id && (
            <p className="text-muted-foreground text-xs" role="status">
              {reminders.status}
              {reminders.error ? ` · ${reminders.error}` : ''}
            </p>
          )}
          <p className="text-muted-foreground text-sm" role="status">
            {state.status}
            {state.lastSynced ? ` · 最近同步：${new Date(state.lastSynced).toLocaleString()}` : ''}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              className="rounded-full px-4 text-xs sm:text-sm font-medium shadow-xs"
              disabled={busy || state.status === '同步中…' || reminders.status === '提醒同步中…'}
              onClick={() => void Promise.all([syncNow(), syncSeriesNotificationsNow()])}
            >
              立即同步
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-4 text-xs sm:text-sm font-medium border-border/50 bg-card/60 backdrop-blur-md shadow-xs"
              disabled={busy}
              onClick={() => {
                try {
                  importDeviceCollection()
                  setMessage('已合并此设备登录前的收藏与历史；云端已有记录优先。')
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : '导入失败')
                }
              }}
            >
              导入此设备原有收藏与历史
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-4 text-xs sm:text-sm font-medium border-border/50 bg-card/60 backdrop-blur-md shadow-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void Promise.all([syncNow(), syncSeriesNotificationsNow()])
                  .then(logout)
                  .catch(error => setMessage(error instanceof Error ? error.message : '退出失败'))
                  .finally(() => setBusy(false))
              }}
            >
              退出账号
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            本机更改立即保存，网络恢复后继续同步。退出仅影响当前设备。
          </p>
          {(message || state.error || error) && (
            <p className="text-sm break-words" role="status">
              {message || state.error || error}
            </p>
          )}
        </div>
      </SettingsSection>
    </>
  )
}
