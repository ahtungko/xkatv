import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'
import type { TvCastMessage } from './tvCastProtocol'
export interface CastSession {
  id: string
  token: string
  pin: string
}
export async function castRpc(action: string, data: object = {}) {
  if (!syncClient) throw new Error('未配置投屏服务')
  let query = syncClient
    .rpc('tv_cast', { p_action: action, p_data: data })
    .abortSignal(AbortSignal.timeout(10000))
  const token = useAuthStore.getState().session?.access_token
  if (token) query = query.setHeader('Authorization', `Bearer ${token}`)
  const { data: result, error } = await query
  if (error || result?.error) throw new Error(result?.error || error?.message || '投屏服务异常')
  return result
}
export function openCastSession(
  session: CastSession,
  onMessage: (message: TvCastMessage) => void,
  onError: () => void,
) {
  let stopped = false
  let cursor = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let failures = 0
  let inFlight = false
  let visibilityEpoch = 0
  const hidden = () => typeof document !== 'undefined' && document.hidden
  const stop = () => {
    stopped = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', wake)
  }
  const poll = async () => {
    if (stopped || inFlight || hidden()) return
    inFlight = true
    const epoch = visibilityEpoch
    try {
      const events = (await castRpc('poll', { ...session, cursor })) as {
        id: number
        payload: TvCastMessage
      }[]
      if (stopped) return
      failures = 0
      for (const event of events) {
        cursor = event.id
        onMessage(event.payload)
      }
    } catch {
      if (!stopped && !hidden() && epoch === visibilityEpoch && ++failures >= 3) {
        stop()
        onError()
      }
    } finally {
      inFlight = false
      if (!stopped && !hidden()) timer = setTimeout(() => void poll(), 750)
    }
  }
  function wake() {
    visibilityEpoch++
    failures = 0
    clearTimeout(timer)
    if (!hidden()) void poll()
  }
  document.addEventListener('visibilitychange', wake)
  void poll()
  return {
    send: async (message: TvCastMessage) => {
      if (stopped) throw new Error('连接已关闭')
      await castRpc('send', { ...session, payload: message })
    },
    stop,
    close: () => {
      stop()
      void castRpc('close', session).catch(() => {})
    },
  }
}
export type CastConnection = ReturnType<typeof openCastSession>
export function mediaIdentity(media: {
  videoUrl: string
  episodeIndex: number
  adFilteringEnabled?: boolean
}) {
  return JSON.stringify([media.videoUrl, media.episodeIndex, media.adFilteringEnabled])
}
