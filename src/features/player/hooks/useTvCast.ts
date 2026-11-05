import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
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
export interface UseTvCastProps {
  currentMedia: TvCastMediaPayload | null
  onPauseLocalPlayer?: () => void
  onPlayNextEpisode?: () => void
  onPlayPrevEpisode?: () => void
  getCurrentTime?: () => number
}
export function useTvCast(props: UseTvCastProps) {
  const latest = useRef(props)
  latest.current = props
  const connection = useRef<CastConnection | null>(null)
  const generation = useRef(0)
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastMedia = useRef('')
  const lastSeen = useRef(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCasting, setIsCasting] = useState(false)
  const [connectedPin, setConnectedPin] = useState('')
  const [remoteState, setRemoteState] = useState<TvCastProgressPayload>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    mediaTitle: '',
    episodeTitle: '',
  })
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('tv_cast_intent') || 'null')
      if (saved && Date.now() - saved.time < 300000) {
        setConnectedPin(saved.pin)
        setIsModalOpen(true)
      }
      sessionStorage.removeItem('tv_cast_intent')
    } catch {
      /* Storage unavailable */
    }
  }, [])
  const disconnect = useCallback(() => {
    generation.current++
    clearTimeout(timeout.current)
    connection.current?.close()
    connection.current = null
    lastMedia.current = ''
    setIsCasting(false)
  }, [])
  const sendMedia = useCallback(() => {
    const media = latest.current.currentMedia
    if (!media || !connection.current || lastMedia.current === mediaIdentity(media)) return
    lastMedia.current = mediaIdentity(media)
    void connection.current
      .send({
        type: 'load_media',
        payload: { ...media, initialTime: latest.current.getCurrentTime?.() ?? media.initialTime },
      })
      .then(() => latest.current.onPauseLocalPlayer?.())
      .catch(() => {
        disconnect()
        toast.error('发送失败，请重新配对')
      })
  }, [disconnect])
  const connectAndCast = useCallback(
    async (pin: string) => {
      if (!/^\d{4}$/.test(pin.trim())) {
        toast.error('请输入四位数字配对码')
        return
      }
      if (!latest.current.currentMedia) {
        toast.error('请先选择视频')
        return
      }
      disconnect()
      const attempt = generation.current
      toast.info('正在连接，请在电视上确认配对')
      try {
        const session = (await castRpc('pair', { pin: pin.trim() })) as CastSession
        if (generation.current !== attempt) {
          void castRpc('close', session).catch(() => {})
          return
        }
        connection.current = openCastSession(
          session,
          msg => {
            if (generation.current !== attempt) return
            if (msg.type === 'connect_ack') {
              lastSeen.current = Date.now()
              clearTimeout(timeout.current)
              setIsCasting(true)
              setConnectedPin(pin)
              sendMedia()
              toast.success('电视已确认连接')
            }
            if (msg.type === 'progress') {
              lastSeen.current = Date.now()
              setRemoteState(msg.payload)
            }
            if (msg.type === 'ended') latest.current.onPlayNextEpisode?.()
            if (msg.type === 'error') toast.error(msg.message)
            if (msg.type === 'disconnect') disconnect()
          },
          () => {
            disconnect()
            toast.error('电视连接已断开，请重新配对')
          },
        )
        timeout.current = setTimeout(() => {
          disconnect()
          toast.error('电视确认超时，请刷新配对码重试')
        }, 30000)
      } catch (error) {
        if (generation.current === attempt)
          toast.error(error instanceof Error ? error.message : '连接失败')
      }
    },
    [disconnect, sendMedia],
  )
  useEffect(() => {
    if (isCasting) sendMedia()
  }, [props.currentMedia, isCasting, sendMedia])
  useEffect(() => {
    if (!isCasting) return
    const timer = setInterval(() => {
      if (Date.now() - lastSeen.current > 20000) {
        disconnect()
        toast.error('电视已离线，请重新配对')
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [isCasting, disconnect])
  const sendCommand = useCallback(
    (action: TvCastCommandAction, value?: number) => {
      if (isCasting)
        void connection.current?.send({ type: 'command', payload: { action, value } }).catch(() => {
          disconnect()
          toast.error('遥控失败，请重新配对')
        })
    },
    [isCasting, disconnect],
  )
  useEffect(
    () => () => {
      generation.current++
      clearTimeout(timeout.current)
      connection.current?.close()
    },
    [],
  )
  return {
    isModalOpen,
    setIsModalOpen,
    isCasting,
    connectedPin,
    recentPins: [],
    remoteState,
    connectAndCast,
    sendCommand,
    disconnect,
    onPlayNextEpisode: props.onPlayNextEpisode,
    onPlayPrevEpisode: props.onPlayPrevEpisode,
  }
}
