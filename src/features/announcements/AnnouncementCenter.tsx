import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogTrigger } from '@/shared/components/ui/dialog'
import { useAuthStore } from '@/shared/store/authStore'
import { dismissAnnouncement, dismissalKey, readDismissal, type Announcement } from './service'
import { useAnnouncement } from './useAnnouncement'
import { AnnouncementDialogContent } from './AnnouncementDialogContent'

function useMaintenanceExpired(announcement: Announcement | null) {
  const endsAt = announcement?.kind === 'maintenance' && announcement.maintenance_end
    ? Date.parse(announcement.maintenance_end)
    : NaN
  const [, tick] = useState(0)

  useEffect(() => {
    if (!Number.isFinite(endsAt)) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      const remaining = endsAt - Date.now()
      if (remaining > 0) timer = setTimeout(update, Math.min(remaining, 2_147_483_647))
    }
    const update = () => {
      clearTimeout(timer)
      tick(value => value + 1)
      schedule()
    }
    schedule()
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [endsAt])

  return Number.isFinite(endsAt) && Date.now() >= endsAt
}

function AccountAnnouncement({ ownerId, deferred }: { ownerId: string; deferred: boolean }) {
  const { announcement } = useAnnouncement()
  const expired = useMaintenanceExpired(announcement)
  const [dismissed, setDismissed] = useState(() => readDismissal(ownerId))
  const [manualRevision, setManualRevision] = useState<number | null>(null)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === dismissalKey(ownerId) || event.key === null)
        setDismissed(readDismissal(ownerId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [ownerId])
  if (!announcement?.published || expired) return null
  const unread = dismissed !== String(announcement.revision)

  return (
    <Dialog
      key={announcement.revision}
      open={!deferred && (unread || manualRevision === announcement.revision)}
      onOpenChange={open => {
        if (open) setManualRevision(announcement.revision)
        else {
          dismissAnnouncement(ownerId, announcement.revision)
          setDismissed(String(announcement.revision))
          setManualRevision(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7"
          aria-label="查看站内公告"
          title={deferred ? '退出播放页或关闭其他通知后查看公告' : '查看站内公告'}
          disabled={deferred}
        >
          <Megaphone className="size-4" />
          {unread && (
            <span
              aria-hidden="true"
              className="bg-primary absolute top-0.5 right-0.5 size-1.5 rounded-full"
            />
          )}
        </Button>
      </DialogTrigger>
      <AnnouncementDialogContent announcement={announcement} />
    </Dialog>
  )
}

export function AnnouncementCenter({ deferred = false }: { deferred?: boolean }) {
  const ownerId = useAuthStore(state => state.account?.id)
  return ownerId ? (
    <AccountAnnouncement key={ownerId} ownerId={ownerId} deferred={deferred} />
  ) : null
}
