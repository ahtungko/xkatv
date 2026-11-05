import { useState, useEffect, useRef, useCallback } from 'react'
import { syncClient } from '@/shared/sync/client'
import {
  type TvCastMediaPayload,
  type TvCastMessage,
  type TvCastProgressPayload,
  type TvCastCommandAction,
  getTvCastChannelName,
  isValidPin,
} from '../lib/tvCastProtocol'
import { toast } from 'sonner'

const RECENT_PINS_KEY = 'xkatv_recent_tv_pins'

function getSavedRecentPins(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PINS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, 5) : []
  } catch {
    return []
  }
}

function saveRecentPin(pin: string) {
  try {
    const existing = getSavedRecentPins().filter(p => p !== pin)
    const updated = [pin, ...existing].slice(0, 5)
    localStorage.setItem(RECENT_PINS_KEY, JSON.stringify(updated))
  } catch {
    // LocalStorage blocked
  }
}

export interface UseTvCastProps {
  currentMedia: TvCastMediaPayload | null
  onPauseLocalPlayer?: () => void
  onPlayNextEpisode?: () => void
  onPlayPrevEpisode?: () => void
}

export function useTvCast({
  currentMedia,
  onPauseLocalPlayer,
  onPlayNextEpisode,
  onPlayPrevEpisode,
}: UseTvCastProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCasting, setIsCasting] = useState(false)
  const [connectedPin, setConnectedPin] = useState<string>('')
  const [recentPins, setRecentPins] = useState<string[]>(() => getSavedRecentPins())
  const [remoteState, setRemoteState] = useState<TvCastProgressPayload>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    mediaTitle: '',
    episodeTitle: '',
  })

  const channelRef = useRef<ReturnType<NonNullable<typeof syncClient>['channel']> | null>(null)
  const currentMediaRef = useRef(currentMedia)
  currentMediaRef.current = currentMedia

  // 检查 URL 是否带参直连 (如扫描二维码进入: /?cast_pin=1234)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const pinParam = params.get('cast_pin')
    if (pinParam && isValidPin(pinParam)) {
      setConnectedPin(pinParam.toUpperCase())
      setIsModalOpen(true)
    }
  }, [])

  // 核心连接函数
  const connectAndCast = useCallback(
    async (pin: string) => {
      const targetPin = pin.trim().toUpperCase()
      if (!isValidPin(targetPin)) {
        toast.error('请输入正确的 4 位电视配对码')
        return
      }

      if (!syncClient) {
        toast.error('未配置 Supabase 实时服务，无法建立投屏连接')
        return
      }

      if (!currentMediaRef.current) {
        toast.error('当前没有正在播放的视频资源')
        return
      }

      // 如果已有旧连接，先清理
      if (channelRef.current) {
        void syncClient.removeChannel(channelRef.current)
        channelRef.current = null
      }

      const channelName = getTvCastChannelName(targetPin)
      const channel = syncClient.channel(channelName, {
        config: {
          broadcast: { self: false },
        },
      })
      channelRef.current = channel

      // 监听电视端回传事件
      channel.on('broadcast', { event: 'cast_event' }, ({ payload }) => {
        const msg = payload as TvCastMessage
        if (!msg) return

        switch (msg.type) {
          case 'connect_ack':
            setIsCasting(true)
            toast.success(`已成功连接至电视 (${msg.deviceName})`)
            break

          case 'progress':
            setRemoteState(msg.payload)
            break

          case 'ended':
            toast.info('电视端当前集播放完毕')
            if (onPlayNextEpisode) {
              onPlayNextEpisode()
            }
            break

          case 'error':
            toast.error(msg.message || '电视端播放异常')
            break
        }
      })

      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          // 1. 发送握手请求
          void channel.send({
            type: 'broadcast',
            event: 'cast_event',
            payload: {
              type: 'connect_request',
              senderId: 'mobile_client',
              senderName: '手机控制端',
            },
          })

          // 2. 暂停手机本地播放器，省流量省电
          if (onPauseLocalPlayer) {
            onPauseLocalPlayer()
          }

          // 3. 将当前播放内容与进度推送给电视
          if (currentMediaRef.current) {
            void channel.send({
              type: 'broadcast',
              event: 'cast_event',
              payload: {
                type: 'load_media',
                payload: currentMediaRef.current,
              },
            })
          }

          setIsCasting(true)
          setConnectedPin(targetPin)
          saveRecentPin(targetPin)
          setRecentPins(getSavedRecentPins())
          toast.success(`已向电视 (${targetPin}) 发送投屏信号`)
        }
      })
    },
    [onPauseLocalPlayer, onPlayNextEpisode],
  )

  // 向电视发送播控指令
  const sendCommand = useCallback((action: TvCastCommandAction, value?: number) => {
    if (!channelRef.current || !isCasting) return

    void channelRef.current.send({
      type: 'broadcast',
      event: 'cast_event',
      payload: {
        type: 'command',
        payload: { action, value },
      },
    })

    // 本地乐观更新部分状态
    if (action === 'play') {
      setRemoteState(prev => ({ ...prev, isPlaying: true }))
    } else if (action === 'pause') {
      setRemoteState(prev => ({ ...prev, isPlaying: false }))
    } else if (action === 'toggle') {
      setRemoteState(prev => ({ ...prev, isPlaying: !prev.isPlaying }))
    } else if (action === 'seek' && typeof value === 'number') {
      setRemoteState(prev => ({ ...prev, currentTime: value }))
    }
  }, [isCasting])

  // 当手机端切集或换源时，自动把新媒体同步给电视
  useEffect(() => {
    if (isCasting && channelRef.current && currentMedia) {
      void channelRef.current.send({
        type: 'broadcast',
        event: 'cast_event',
        payload: {
          type: 'load_media',
          payload: currentMedia,
        },
      })
      if (onPauseLocalPlayer) {
        onPauseLocalPlayer()
      }
    }
  }, [currentMedia, isCasting, onPauseLocalPlayer])

  // 断开投屏
  const disconnect = useCallback(() => {
    if (channelRef.current) {
      void channelRef.current.send({
        type: 'broadcast',
        event: 'cast_event',
        payload: { type: 'disconnect' },
      })
      if (syncClient) {
        void syncClient.removeChannel(channelRef.current)
      }
      channelRef.current = null
    }

    setIsCasting(false)
    toast.info('已断开与电视的连接')
  }, [])

  // 清理
  useEffect(() => {
    return () => {
      if (channelRef.current && syncClient) {
        void syncClient.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  return {
    isModalOpen,
    setIsModalOpen,
    isCasting,
    connectedPin,
    recentPins,
    remoteState,
    connectAndCast,
    sendCommand,
    disconnect,
    onPlayNextEpisode,
    onPlayPrevEpisode,
  }
}
