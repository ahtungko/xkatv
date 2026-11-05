import { create } from 'zustand'
import { toast } from 'sonner'
import { useAuthStore } from '@/shared/store/authStore'
import {
  castRpc,
  openCastSession,
  mediaIdentity,
  type CastConnection,
  type CastSession,
} from '../lib/tvCastSession'
import type {
  TvCastMediaPayload,
  TvCastProgressPayload,
  TvCastCommandAction,
} from '../lib/tvCastProtocol'
let connection: CastConnection | null = null
let generation = 0
let deadline: ReturnType<typeof setTimeout> | undefined
let watchdog: ReturnType<typeof setInterval> | undefined
let lastSeen = 0
let ended: (() => void) | undefined
let resolvePending: ((allow: boolean) => void) | undefined
let owner: string | undefined
const emptyProgress: TvCastProgressPayload = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  mediaTitle: '',
  episodeTitle: '',
}
interface CastState {
  status: 'idle' | 'connecting' | 'connected'
  pin: string
  error: string
  remoteState: TvCastProgressPayload
  pendingMedia: TvCastMediaPayload | null
  resolveSwitch: (allow: boolean) => void
  requestMedia: (media: TvCastMediaPayload) => Promise<boolean>
  mediaKey: string
  connect: (pin: string) => Promise<void>
  disconnect: () => void
  playMedia: (media: TvCastMediaPayload) => Promise<boolean>
  command: (action: TvCastCommandAction, value?: number) => void
}
export const useTvCastStore = create<CastState>((set, get) => ({
  pendingMedia: null,
  resolveSwitch: allow => {
    const resolve = resolvePending
    resolvePending = undefined
    set({ pendingMedia: null })
    resolve?.(allow)
  },
  requestMedia: async media => {
    if (get().mediaKey === mediaIdentity(media)) return false
    get().resolveSwitch(false)
    if (get().mediaKey || get().remoteState.mediaTitle) {
      const accepted = await new Promise<boolean>(resolve => {
        resolvePending = resolve
        set({ pendingMedia: media })
      })
      if (!accepted) return false
    }
    return get().playMedia(media)
  },
  status: 'idle',
  pin: '',
  error: '',
  remoteState: emptyProgress,
  mediaKey: '',
  disconnect: () => {
    get().resolveSwitch(false)
    generation++
    clearTimeout(deadline)
    clearInterval(watchdog)
    connection?.close()
    connection = null
    owner = undefined
    set({ status: 'idle', pin: '', remoteState: emptyProgress, mediaKey: '' })
  },
  connect: async raw => {
    const pin = raw.trim()
    if (!/^\d{4}$/.test(pin)) {
      set({ error: '请输入四位数字配对码' })
      return
    }
    if (get().pin === pin && get().status !== 'idle') return
    get().disconnect()
    const attempt = generation
    owner = useAuthStore.getState().account?.id
    set({ status: 'connecting', pin, error: '' })
    const fail = (message: string) => {
      if (attempt !== generation) return
      get().disconnect()
      set({ error: message })
      toast.error(message)
    }
    try {
      const session = (await castRpc('pair', { pin })) as CastSession
      if (attempt !== generation) {
        void castRpc('close', session).catch(() => {})
        return
      }
      connection = openCastSession(
        session,
        msg => {
          if (attempt !== generation) return
          if (msg.type === 'connect_ack') {
            lastSeen = Date.now()
            clearTimeout(deadline)
            set({ status: 'connected' })
            clearInterval(watchdog)
            watchdog = setInterval(() => {
              if (!document.hidden && Date.now() - lastSeen > 20000) fail('电视已离线，请重新配对')
            }, 3000)
          }
          if (msg.type === 'progress') {
            lastSeen = Date.now()
            set({ remoteState: msg.payload })
          }
          if (msg.type === 'ended') {
            set({ mediaKey: '', remoteState: emptyProgress })
            ended?.()
          }
          if (msg.type === 'error') toast.error(msg.message)
          if (msg.type === 'disconnect') fail('电视已断开连接')
        },
        () => fail('电视连接已断开，请重新配对'),
      )
      deadline = setTimeout(() => fail('电视确认超时，请刷新配对码重试'), 30000)
    } catch (e) {
      fail(e instanceof Error ? e.message : '配对失败')
    }
  },
  playMedia: async media => {
    if (get().status !== 'connected' || !connection) return false
    const attempt = generation
    try {
      await connection.send({ type: 'load_media', payload: media })
      if (attempt !== generation) return false
      set({ mediaKey: mediaIdentity(media) })
      return true
    } catch {
      if (attempt === generation) {
        get().disconnect()
        set({ error: '发送失败，请重新配对' })
      }
      return false
    }
  },
  command: (action, value) => {
    if (get().status !== 'connected' || !connection) return
    if (value !== undefined && !Number.isFinite(value)) return
    const attempt = generation
    void connection.send({ type: 'command', payload: { action, value } }).catch(() => {
      if (attempt === generation) {
        get().disconnect()
        toast.error('遥控失败，请重新配对')
      }
    })
  },
}))
export function registerCastEnded(handler: () => void) {
  ended = handler
  return () => {
    if (ended === handler) ended = undefined
  }
}
// A playback route unmount must not end pairing; signing out must.
useAuthStore.subscribe(state => {
  if (owner && state.account?.id !== owner) useTvCastStore.getState().disconnect()
})

// Backgrounded mobile tabs stop timers/network. Give reconnection a fresh grace period.
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    lastSeen = Date.now()
  })
