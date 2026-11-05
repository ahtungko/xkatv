import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'
import { createHlsLoaderClass, createM3u8Processor } from '@xkatv/cms-core/m3u8'
import { syncClient } from '@/shared/sync/client'
import {
  type TvCastMediaPayload,
  type TvCastMessage,
  getTvCastChannelName,
} from '../lib/tvCastProtocol'
import { Tv, QrCode, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

const m3u8Processor = createM3u8Processor({ filterAds: true })

function generatePin(): string {
  // 4位数字码，直观、适合遥控器与键盘输入
  return Math.floor(1000 + Math.random() * 9000).toString()
}

interface ArtplayerWithHls extends Artplayer {
  hls?: Hls
}

export default function TvReceiverView() {
  const [pin, setPin] = useState<string>(() => generatePin())
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [isConnected, setIsConnected] = useState(false)
  const [connectedDevice, setConnectedDevice] = useState<string>('')
  const [currentMedia, setCurrentMedia] = useState<TvCastMediaPayload | null>(null)
  const [osdMessage, setOsdMessage] = useState<string>('')
  const [isOsdVisible, setIsOsdVisible] = useState(false)

  const playerContainerRef = useRef<HTMLDivElement | null>(null)
  const artRef = useRef<ArtplayerWithHls | null>(null)
  const channelRef = useRef<ReturnType<NonNullable<typeof syncClient>['channel']> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const osdTimerRef = useRef<number | null>(null)

  const showOsd = useCallback((text: string, duration = 3000) => {
    setOsdMessage(text)
    setIsOsdVisible(true)
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current)
    osdTimerRef.current = window.setTimeout(() => {
      setIsOsdVisible(false)
    }, duration)
  }, [])

  // 请求防息屏 WakeLock
  useEffect(() => {
    if (currentMedia && 'wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then(lock => {
          wakeLockRef.current = lock
        })
        .catch(() => {
          // 部分环境或非安全上下文可能不支持
        })
    }
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {})
        wakeLockRef.current = null
      }
    }
  }, [currentMedia])

  // 生成二维码
  useEffect(() => {
    if (!pin) return
    const pairUrl = `${window.location.origin}/?cast_pin=${pin}`
    QRCode.toDataURL(pairUrl, {
      width: 300,
      margin: 1,
      color: {
        dark: '#ffffff',
        light: '#09090b',
      },
    })
      .then(url => setQrCodeUrl(url))
      .catch(err => console.error('[TvReceiver] QR generate failed:', err))
  }, [pin])

  // 刷新配对码
  const handleRegeneratePin = () => {
    if (channelRef.current && syncClient) {
      void syncClient.removeChannel(channelRef.current)
      channelRef.current = null
    }
    setPin(generatePin())
    setIsConnected(false)
    setConnectedDevice('')
  }

  // 监听 Supabase Realtime 通道
  useEffect(() => {
    if (!syncClient) return

    const channelName = getTvCastChannelName(pin)
    const channel = syncClient.channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    })
    channelRef.current = channel

    channel.on('broadcast', { event: 'cast_event' }, ({ payload }) => {
      const msg = payload as TvCastMessage
      if (!msg) return

      switch (msg.type) {
        case 'connect_request': {
          setIsConnected(true)
          setConnectedDevice(msg.senderName || '控制端')
          showOsd(`已连接至 ${msg.senderName || '控制端'}`)
          // 回复连接确认
          void channel.send({
            type: 'broadcast',
            event: 'cast_event',
            payload: {
              type: 'connect_ack',
              deviceName: 'LG WebOS TV',
              isPlaying: Boolean(artRef.current && !artRef.current.video?.paused),
            },
          })
          break
        }

        case 'load_media': {
          setIsConnected(true)
          setCurrentMedia(msg.payload)
          showOsd(`正在加载：《${msg.payload.mediaTitle}》 ${msg.payload.episodeTitle}`)
          break
        }

        case 'command': {
          const player = artRef.current
          if (!player) break

          switch (msg.payload.action) {
            case 'play':
              void player.play()
              showOsd('▶ 播放')
              break
            case 'pause':
              player.pause()
              showOsd('⏸ 暂停')
              break
            case 'toggle':
              player.toggle()
              showOsd(player.video?.paused ? '⏸ 暂停' : '▶ 播放')
              break
            case 'seek':
              if (typeof msg.payload.value === 'number') {
                player.seek = msg.payload.value
                const m = Math.floor(msg.payload.value / 60)
                const s = Math.floor(msg.payload.value % 60)
                showOsd(`⏩ 跳转至 ${m}:${s.toString().padStart(2, '0')}`)
              }
              break
            case 'skip_intro':
              player.seek = (player.currentTime || 0) + 90
              showOsd('⏩ 已跳过片头 (+90s)')
              break
            case 'volume':
              if (typeof msg.payload.value === 'number') {
                player.volume = Math.max(0, Math.min(1, msg.payload.value))
                showOsd(`🔊 音量: ${Math.round(player.volume * 100)}%`)
              }
              break
          }
          break
        }

        case 'disconnect': {
          setIsConnected(false)
          setConnectedDevice('')
          if (artRef.current) {
            artRef.current.destroy(true)
            artRef.current = null
          }
          setCurrentMedia(null)
          showOsd('控制端已断开连接')
          break
        }
      }
    })

    channel.subscribe()

    return () => {
      if (channel && syncClient) {
        void syncClient.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [pin, showOsd])

  // 播放器挂载与生命周期管理
  useEffect(() => {
    if (!currentMedia || !playerContainerRef.current) return

    const container = playerContainerRef.current
    if (artRef.current) {
      artRef.current.destroy(true)
      artRef.current = null
    }

    const art = new Artplayer({
      container,
      url: currentMedia.videoUrl,
      type: 'm3u8',
      autoplay: true,
      fullscreen: true,
      fullscreenWeb: true,
      airplay: false,
      theme: '#3b82f6',
      playsInline: true,
      setting: false,
      pip: false,
      lang: 'zh-cn',
      moreVideoAttr: {
        crossOrigin: 'anonymous',
        playsInline: true,
      },
      customType: {
        m3u8: (video: HTMLMediaElement, url: string, player: Artplayer) => {
          const playerWithHls = player as ArtplayerWithHls
          if (Hls.isSupported()) {
            if (playerWithHls.hls) playerWithHls.hls.destroy()
            const hlsConfig: Partial<HlsConfig> = currentMedia.adFilteringEnabled
              ? {
                  loader: createHlsLoaderClass({
                    Hls,
                    m3u8Processor,
                  }) as unknown as typeof Hls.DefaultConfig.loader,
                }
              : {}

            const hls = new Hls({
              ...hlsConfig,
              enableWorker: true,
              lowLatencyMode: false,
            })
            hls.loadSource(url)
            hls.attachMedia(video)
            playerWithHls.hls = hls

            hls.on(Hls.Events.ERROR, (_evt, data) => {
              if (data.fatal) {
                console.error('[TvReceiver] HLS fatal error:', data)
                showOsd('视频加载失败，请在手机上尝试更换视频源')
              }
            })
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url
          }
        },
      },
    }) as ArtplayerWithHls

    art.on('ready', () => {
      if (currentMedia.initialTime && currentMedia.initialTime > 0) {
        art.seek = currentMedia.initialTime
      }
      showOsd(`正在播放：《${currentMedia.mediaTitle}》 ${currentMedia.episodeTitle}`, 4000)
    })

    art.on('video:ended', () => {
      if (channelRef.current) {
        void channelRef.current.send({
          type: 'broadcast',
          event: 'cast_event',
          payload: { type: 'ended' },
        })
      }
      showOsd('当前集播放完毕')
    })

    artRef.current = art

    // 心跳进度回传 (每 1.5 秒向手机广播一次进度)
    const progressTimer = window.setInterval(() => {
      if (!channelRef.current || !artRef.current) return
      const player = artRef.current
      void channelRef.current.send({
        type: 'broadcast',
        event: 'cast_event',
        payload: {
          type: 'progress',
          payload: {
            isPlaying: Boolean(player.video && !player.video.paused),
            currentTime: player.currentTime || 0,
            duration: player.duration || 0,
            mediaTitle: currentMedia.mediaTitle,
            episodeTitle: currentMedia.episodeTitle,
          },
        },
      })
    }, 1500)

    return () => {
      window.clearInterval(progressTimer)
      if (artRef.current) {
        artRef.current.destroy(true)
        artRef.current = null
      }
    }
  }, [currentMedia, showOsd])

  // LG 动感遥控器（Magic Remote）按键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const player = artRef.current
      if (!player) return

      switch (e.key) {
        case 'Enter':
        case ' ': // 遥控器确定键或空格
          e.preventDefault()
          player.toggle()
          showOsd(player.video?.paused ? '⏸ 暂停' : '▶ 播放')
          break
        case 'ArrowLeft': // 快退 10s
          e.preventDefault()
          player.seek = Math.max(0, (player.currentTime || 0) - 10)
          showOsd(`⏪ 快退 10s (${Math.floor(player.seek)}s)`)
          break
        case 'ArrowRight': // 快进 10s
          e.preventDefault()
          player.seek = Math.min(player.duration || 0, (player.currentTime || 0) + 10)
          showOsd(`⏩ 快进 10s (${Math.floor(player.seek)}s)`)
          break
        case 'ArrowUp': // 音量加
          e.preventDefault()
          player.volume = Math.min(1, (player.volume || 0) + 0.1)
          showOsd(`🔊 音量: ${Math.round(player.volume * 100)}%`)
          break
        case 'ArrowDown': // 音量减
          e.preventDefault()
          player.volume = Math.max(0, (player.volume || 0) - 0.1)
          showOsd(`🔉 音量: ${Math.round(player.volume * 100)}%`)
          break
        case 'Escape':
        case 'Backspace': // 返回键回到配对界面
          e.preventDefault()
          setCurrentMedia(null)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showOsd])

  if (!syncClient) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white">
        <AlertTriangle className="size-16 text-amber-500 mb-4 animate-bounce" />
        <h1 className="text-2xl font-bold">需要配置 Supabase 实时服务</h1>
        <p className="mt-2 text-zinc-400 max-w-md text-sm leading-relaxed">
          Web-to-Web 扫码投屏基于 Supabase Realtime 进行设备间即时通信。当前站点尚未配置 Supabase 凭据，请在环境变量或设置中心中完成配置。
        </p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full bg-zinc-950 text-white overflow-hidden select-none font-sans">
      {/* 顶部 OSD 提示浮层 */}
      {isOsdVisible && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300">
          <div className="flex items-center gap-2.5 rounded-full bg-black/85 px-6 py-2.5 text-sm md:text-base font-semibold text-white shadow-2xl border border-white/20 backdrop-blur-xl animate-in fade-in zoom-in-95">
            <Sparkles className="size-4 text-blue-400" />
            <span>{osdMessage}</span>
          </div>
        </div>
      )}

      {/* 正在播放时的全屏播放器容器 */}
      {currentMedia ? (
        <div className="fixed inset-0 z-40 bg-black flex flex-col justify-center items-center">
          <div ref={playerContainerRef} className="size-full" />
          {/* 遥控器操作指引小条（悬浮在左上方，半透明） */}
          <div className="absolute top-4 left-6 z-50 flex items-center gap-3 text-xs text-white/50 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10 pointer-events-none opacity-0 hover:opacity-100 transition-opacity">
            <span>OK: 播放/暂停</span>
            <span>←/→: 快退/快进 10s</span>
            <span>↑/↓: 调节音量</span>
            <span>返回键: 退出播放</span>
          </div>
        </div>
      ) : (
        /* 待机配对界面 (Cinema Standby Mode) */
        <main className="flex min-h-screen flex-col items-center justify-between p-6 md:p-12">
          {/* 顶部品牌 */}
          <header className="flex w-full items-center justify-between max-w-5xl">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 shadow-inner">
                <Tv className="size-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
                  xkaTV <span className="text-xs md:text-sm font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">大屏接收端</span>
                </h1>
                <p className="text-xs text-zinc-400">智能电视 / LG webOS 专属全屏影院</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${isConnected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-900 text-zinc-400 border-zinc-800'}`}>
                <span className={`size-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                {isConnected ? `已连接 (${connectedDevice})` : '等待手机投屏'}
              </div>
            </div>
          </header>

          {/* 中央大屏配对卡片 */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-14 my-auto max-w-4xl w-full">
            {/* 二维码展示区 */}
            <div className="flex flex-col items-center gap-3 p-5 rounded-3xl bg-zinc-900/80 border border-white/10 shadow-2xl backdrop-blur-md">
              <div className="p-3 bg-zinc-950 rounded-2xl border border-white/10 shadow-inner">
                {qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="投屏二维码"
                    className="size-48 sm:size-56 md:size-64 object-contain rounded-xl"
                  />
                ) : (
                  <div className="size-48 sm:size-56 md:size-64 flex items-center justify-center text-zinc-500">
                    <QrCode className="size-16 animate-pulse" />
                  </div>
                )}
              </div>
              <p className="text-xs md:text-sm text-zinc-400 font-medium">使用手机相机或扫一扫直接配对</p>
            </div>

            {/* 4 位数字配对码展示区 */}
            <div className="flex flex-col items-center md:items-start space-y-6 text-center md:text-left">
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-blue-400 font-semibold">TV Pairing Code</span>
                <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">4 位数字配对码</h2>
                <p className="text-sm text-zinc-400">在手机/电脑播放器上点击「投屏到电视」并输入：</p>
              </div>

              {/* 醒目的 PIN 码方块 */}
              <div className="flex items-center gap-3">
                {pin.split('').map((digit, idx) => (
                  <div
                    key={idx}
                    className="flex size-14 sm:size-16 md:size-20 items-center justify-center rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-900 border-2 border-blue-500/40 text-3xl sm:text-4xl md:text-5xl font-black text-white shadow-lg tracking-wider"
                  >
                    {digit}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegeneratePin}
                  className="rounded-full border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:text-white hover:bg-zinc-800 gap-1.5 text-xs h-8"
                >
                  <RefreshCw className="size-3.5" />
                  刷新配对码
                </Button>
              </div>
            </div>
          </div>

          {/* 底部使用引导与遥控器技巧 */}
          <footer className="w-full max-w-4xl rounded-2xl bg-zinc-900/40 border border-white/5 p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-400 shrink-0" />
              <span>
                <strong>LG 遥控器技巧：</strong>在 LG 电视遥控器上按黄色键或在浏览器菜单中将本页添加为<strong>「书签」</strong>，下次开机一键直达！
              </span>
            </div>
            <div className="flex items-center gap-4 text-zinc-400">
              <span>① 手机播放影片</span>
              <span>→</span>
              <span>② 点「投屏到电视」</span>
              <span>→</span>
              <span>③ 自动全屏播放</span>
            </div>
          </footer>
        </main>
      )}
    </div>
  )
}
