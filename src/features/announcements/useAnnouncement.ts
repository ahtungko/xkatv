import { useEffect, useState } from 'react'
import { useAuthStore } from '@/shared/store/authStore'
import { readAnnouncement, type Announcement } from './service'

export function useAnnouncement(poll = true) {
  const ownerId = useAuthStore(state => state.account?.id)
  const role = useAuthStore(state => state.account?.role)
  const identity = `${ownerId}:${role}`
  const [reloadCount, setReloadCount] = useState(0)
  const [state, setState] = useState<{
    identity: string
    announcement: Announcement | null
    loading: boolean
    error: string
  }>({ identity: '', announcement: null, loading: true, error: '' })

  useEffect(() => {
    if (!ownerId) return
    const controller = new AbortController()
    let pending = false
    setState({ identity, announcement: null, loading: true, error: '' })
    const load = async () => {
      if (pending || controller.signal.aborted) return
      pending = true
      try {
        const announcement = await readAnnouncement(ownerId, controller.signal)
        if (!controller.signal.aborted)
          setState({ identity, announcement, loading: false, error: '' })
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            identity,
            announcement: null,
            loading: false,
            error: error instanceof Error ? error.message : '公告加载失败，请重试',
          })
      } finally {
        pending = false
      }
    }
    void load()
    const refresh = () => {
      if (document.visibilityState === 'visible') void load()
    }
    if (poll) {
      window.addEventListener('focus', refresh)
      window.addEventListener('online', refresh)
      document.addEventListener('visibilitychange', refresh)
    }
    const interval = poll ? window.setInterval(refresh, 60_000) : undefined
    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [ownerId, identity, poll, reloadCount])

  return {
    announcement: state.identity === identity ? state.announcement : null,
    loading: Boolean(ownerId) && (state.identity !== identity || state.loading),
    error: state.identity === identity ? state.error : '',
    reload: () => setReloadCount(count => count + 1),
  }
}
