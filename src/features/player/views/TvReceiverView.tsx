import { finiteTime, seekTv, toggleTv, handleTvKey } from '../lib/tvControls'
import { syncClient } from '@/shared/sync/client'
import { castRpc, openCastSession, mediaIdentity, type CastSession } from '../lib/tvCastSession'
import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'
import { createHlsLoaderClass, createM3u8Processor } from '@xkatv/cms-core/m3u8'
import { type TvCastMediaPayload, type TvCastMessage } from '../lib/tvCastProtocol'
import { Tv, QrCode, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

const m3u8Processor = createM3u8Processor({ filterAds: true })

interface ArtplayerWithHls extends Artplayer {
  hls?: Hls
}

export default function TvReceiverView() {
  const [pin, setPin] = useState<string>('')
  const [sessionVersion, setSessionVersion] = useState(0)
  const [pending, setPending] = useState(false)
  const [pairError, setPairError] = useState('')
  const acceptedRef = useRef(false)
  const loadedRef = useRef('')
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [isConnected, setIsConnected] = useState(false)
  const [connectedDevice, setConnectedDevice] = useState<string>('')
  const [currentMedia, setCurrentMedia] = useState<TvCastMediaPayload | null>(null)
  const [osdMessage, setOsdMessage] = useState<string>('')
  const [isOsdVisible, setIsOsdVisible] = useState(false)

  const playerContainerRef = useRef<HTMLDivElement | null>(null)
  const artRef = useRef<ArtplayerWithHls | null>(null)
  const channelRef = useRef<{
    send: (event: { payload: TvCastMessage; type?: string; event?: string }) => Promise<void>
    close: () => void
  } | null>(null)
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
    const pairUrl = `${window.location.origin}/cast?cast_pin=${pin}`
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
    channelRef.current?.close()
    setCurrentMedia(null)
    setPin('')
    setQrCodeUrl('')
    setPending(false)
    acceptedRef.current = false
    loadedRef.current = ''
    setIsConnected(false)
    setConnectedDevice('')
    setSessionVersion(v => v + 1)
  }

  useEffect(() => {
    let cancelled = false
    let close: (() => void) | undefined
    setPairError('')
    void castRpc('create')
      .then((session: CastSession) => {
        if (cancelled) {
          void castRpc('close', session).catch(() => {})
          return
        }
        setPin(session.pin)
        const channel = {
          send: async (event: { payload: TvCastMessage; type?: string; event?: string }) => {
            try {
              await transport.send(event.payload)
              if (event.payload.type === 'connect_ack') {
                acceptedRef.current = true
                setPending(false)
                setIsConnected(true)
              }
            } catch {
              setPairError('连接失败，请刷新配对码')
              setCurrentMedia(null)
            }
          },
          close: () => transport.close(),
        }
        const transport = openCastSession(
          session,
          (msg: TvCastMessage) => {
            switch (msg.type) {
              case 'connect_request': {
                setPending(true)
                setConnectedDevice(msg.senderName || '手机控制端')
                break
              }

              case 'load_media': {
                if (
                  !acceptedRef.current ||
                  !msg.payload ||
                  !/^https?:\/\//.test(msg.payload.videoUrl)
                )
                  break
                const key = mediaIdentity(msg.payload)
                if (loadedRef.current === key) break
                loadedRef.current = key
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
                    toggleTv(player, showOsd)
                    break
                  case 'seek':
                    seekTv(player, msg.payload.value ?? NaN, showOsd)
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
          },
          () => {
            setPairError('会话已失效，请刷新配对码')
            setCurrentMedia(null)
            setIsConnected(false)
            setPending(false)
          },
        )
        channelRef.current = channel
        close = channel.close
      })
      .catch(error => {
        if (!cancelled) setPairError(error instanceof Error ? error.message : '配对服务不可用')
      })
    return () => {
      cancelled = true
      close?.()
      channelRef.current = null
    }
  }, [sessionVersion, showOsd])

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
      hotkey: false,
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

    return () => {
      if (artRef.current) {
        artRef.current.hls?.destroy()
        artRef.current.destroy(true)
        artRef.current = null
      }
    }
  }, [currentMedia, showOsd])

  // Keep paired idle TVs alive too; the phone may select a video later.
  useEffect(() => {
    if (!isConnected) return
    const timer = setInterval(() => {
      const player = artRef.current
      void channelRef.current?.send({
        payload: {
          type: 'progress',
          payload: {
            isPlaying: Boolean(player?.video && !player.video.paused),
            currentTime: finiteTime(player?.currentTime),
            duration: finiteTime(player?.duration),
            mediaTitle: currentMedia?.mediaTitle || '',
            episodeTitle: currentMedia?.episodeTitle || '',
          },
        },
      })
    }, 1500)
    return () => clearInterval(timer)
  }, [isConnected, currentMedia])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (artRef.current)
        handleTvKey(e, artRef.current, showOsd, () => {
          loadedRef.current = ''
          setCurrentMedia(null)
        })
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [showOsd])

  if (!syncClient) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white">
        <AlertTriangle className="mb-4 size-16 animate-bounce text-amber-500" />
        <h1 className="text-2xl font-bold">未启用多端同步服务</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
          扫码投屏需要启用云端实时同步服务。请检查站点环境配置或在系统设置中确认同步状态。
        </p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-zinc-950 font-sans text-white select-none">
      {/* 顶部 OSD 提示浮层 */}
      {isOsdVisible && (
        <div className="pointer-events-none fixed top-8 left-1/2 z-50 -translate-x-1/2 transition-all duration-300">
          <div className="animate-in fade-in zoom-in-95 flex items-center gap-2.5 rounded-full border border-white/20 bg-black/85 px-6 py-2.5 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl md:text-base">
            <Sparkles className="size-4 text-blue-400" />
            <span>{osdMessage}</span>
          </div>
        </div>
      )}

      {/* 正在播放时的全屏播放器容器 */}
      {currentMedia ? (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black">
          <div ref={playerContainerRef} className="size-full" />
          {/* 遥控器操作指引小条（悬浮在左上方，半透明） */}
          <div className="pointer-events-none absolute top-4 left-6 z-50 flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/50 opacity-0 backdrop-blur-md transition-opacity hover:opacity-100">
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
          <header className="flex w-full max-w-5xl items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-600/20 text-blue-400 shadow-inner">
                <Tv className="size-6" />
              </div>
              <div>
                <h1 className="flex items-center gap-2 text-xl font-black tracking-tight md:text-2xl">
                  xkaTV{' '}
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300 md:text-sm">
                    大屏接收端
                  </span>
                </h1>
                <p className="text-xs text-zinc-400">大屏沉浸式全屏影院</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${isConnected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-zinc-800 bg-zinc-900 text-zinc-400'}`}
              >
                <span
                  className={`size-2 rounded-full ${isConnected ? 'animate-pulse bg-emerald-400' : 'bg-zinc-500'}`}
                />
                {isConnected ? `已连接 (${connectedDevice}) · 等待选片` : '等待手机配对'}
              </div>
            </div>
          </header>

          {pairError && (
            <p role="alert" className="text-red-400">
              {pairError}
            </p>
          )}
          {pending && (
            <div className="flex items-center gap-4">
              <span>允许手机控制端投屏到这台电视？</span>
              <Button
                onClick={() => {
                  void channelRef.current?.send({
                    payload: { type: 'connect_ack', deviceName: 'TV', isPlaying: false },
                  })
                }}
              >
                允许投屏
              </Button>
              <Button variant="outline" onClick={handleRegeneratePin}>
                拒绝并刷新配对码
              </Button>
            </div>
          )}
          {/* 中央大屏配对卡片 */}
          <div className="my-auto flex w-full max-w-4xl flex-col items-center justify-center gap-8 md:flex-row md:gap-14">
            {/* 二维码展示区 */}
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-zinc-900/80 p-5 shadow-2xl backdrop-blur-md">
              <div className="rounded-2xl border border-white/10 bg-zinc-950 p-3 shadow-inner">
                {qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="投屏二维码"
                    className="size-48 rounded-xl object-contain sm:size-56 md:size-64"
                  />
                ) : (
                  <div className="flex size-48 items-center justify-center text-zinc-500 sm:size-56 md:size-64">
                    <QrCode className="size-16 animate-pulse" />
                  </div>
                )}
              </div>
              <p className="text-xs font-medium text-zinc-400 md:text-sm">
                手机扫码配对，在电视确认后再选片
              </p>
            </div>

            {/* 4 位数字配对码展示区 */}
            <div className="flex flex-col items-center space-y-6 text-center md:items-start md:text-left">
              <div className="space-y-1">
                <span className="text-xs font-semibold tracking-wider text-blue-400 uppercase">
                  TV Pairing Code
                </span>
                <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                  4 位数字配对码
                </h2>
                <p className="text-sm text-zinc-400">
                  在手机/电脑播放器上点击「投屏到电视」并输入：
                </p>
              </div>

              {/* 醒目的 PIN 码方块 */}
              <div className="flex items-center gap-3">
                {pin.split('').map((digit, idx) => (
                  <div
                    key={idx}
                    className="flex size-14 items-center justify-center rounded-2xl border-2 border-blue-500/40 bg-gradient-to-b from-zinc-800 to-zinc-900 text-3xl font-black tracking-wider text-white shadow-lg sm:size-16 sm:text-4xl md:size-20 md:text-5xl"
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
                  className="h-8 gap-1.5 rounded-full border-zinc-800 bg-zinc-900/60 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  <RefreshCw className="size-3.5" />
                  刷新配对码
                </Button>
              </div>
            </div>
          </div>

          {/* 底部使用引导与遥控器技巧 */}
          <footer className="flex w-full max-w-4xl flex-col items-center justify-between gap-3 rounded-2xl border border-white/5 bg-zinc-900/40 p-4 text-xs text-zinc-400 md:flex-row md:p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 shrink-0 text-amber-400" />
              <span>
                <strong>遥控器技巧：</strong>在电视遥控器或浏览器菜单中将本页添加为
                <strong>「书签」</strong>
                ，下次开机一键直达！
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
