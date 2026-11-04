import { useEffect, useRef, useState, useCallback } from 'react'
import Artplayer from 'artplayer'
import Hls from 'hls.js'
import type { LiveChannel } from '@/shared/types/live'
import { buildProxyRequestUrl } from '@/shared/config/api.config'
import { useSettingStore } from '@/shared/store/settingStore'
import { Tv, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

interface LivePlayerProps {
  channel: LiveChannel | null
  className?: string
}

type ArtplayerWithHls = Artplayer & {
  hls?: Hls
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createLiveHlsLoader(HlsClass: any): any {
  return class LiveHlsLoader extends HlsClass.DefaultConfig.loader {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    load(context: any, config: any, callbacks: any) {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
      const originalUrl = context.url

      // If page is HTTPS and target is HTTP, route through proxy pool
      if (isHttps && originalUrl && typeof originalUrl === 'string' && originalUrl.startsWith('http://')) {
        const { network } = useSettingStore.getState()
        context.url = buildProxyRequestUrl(originalUrl, network.proxyUrl)
      }

      super.load(context, config, callbacks)
    }
  }
}

export function LivePlayer({ channel, className }: LivePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const artRef = useRef<ArtplayerWithHls | null>(null)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleRetry = useCallback(() => {
    setHasError(false)
    setErrorMessage('')
    if (artRef.current && channel) {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
      const playUrl =
        isHttps && channel.url.startsWith('http://')
          ? buildProxyRequestUrl(channel.url, useSettingStore.getState().network.proxyUrl)
          : channel.url
      if (artRef.current.hls) {
        artRef.current.hls.destroy()
        artRef.current.hls = undefined
      }
      artRef.current.type = 'm3u8'
      artRef.current.switchUrl(playUrl)
    }
  }, [channel])

  useEffect(() => {
    if (!containerRef.current) return

    setHasError(false)
    setErrorMessage('')

    const { playback } = useSettingStore.getState()
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'

    const initialUrl = channel
      ? isHttps && channel.url.startsWith('http://')
        ? buildProxyRequestUrl(channel.url, useSettingStore.getState().network.proxyUrl)
        : channel.url
      : ''

    const playM3u8 = (video: HTMLMediaElement, url: string, player: Artplayer) => {
      const playerWithHls = player as ArtplayerWithHls
      if (Hls.isSupported()) {
        if (playerWithHls.hls) {
          playerWithHls.hls.destroy()
        }

        const LiveLoader = createLiveHlsLoader(Hls)
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
          liveSyncDurationCount: 3,
          loader: LiveLoader as unknown as typeof Hls.DefaultConfig.loader,
        })

        hls.loadSource(url)
        hls.attachMedia(video)
        playerWithHls.hls = hls

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.warn('[LivePlayer] 遇到网络错误，尝试恢复...', data)
                hls.startLoad()
                break
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.warn('[LivePlayer] 遇到媒体错误，尝试恢复...', data)
                hls.recoverMediaError()
                break
              default:
                console.error('[LivePlayer] 严重播放错误:', data)
                setHasError(true)
                setErrorMessage('直播信号解析中断或源不可用')
                hls.destroy()
                break
            }
          }
        })

        player.on('destroy', () => {
          hls.destroy()
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
      } else {
        player.notice.show = '当前浏览器不支持播放此直播流'
      }
    }

    const art = new Artplayer({
      container: containerRef.current,
      url: initialUrl,
      type: 'm3u8',
      isLive: true,
      autoplay: true,
      autoSize: false,
      autoMini: false,
      pip: playback.isPipEnabled,
      screenshot: false,
      setting: true,
      loop: false,
      flip: false,
      playbackRate: false,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      miniProgressBar: false,
      mutex: true,
      backdrop: true,
      playsInline: true,
      volume: playback.defaultVolume,
      theme: playback.playerThemeColor || '#ef4444',
      lang: 'zh-cn',
      moreVideoAttr: {
        crossOrigin: 'anonymous',
        playsInline: true,
      },
      customType: {
        m3u8: playM3u8,
        hls: playM3u8,
      },
    }) as ArtplayerWithHls

    art.on('error', err => {
      console.warn('[LivePlayer] Artplayer 错误:', err)
      setHasError(true)
      setErrorMessage('无法连接到该直播源或格式不支持')
    })

    artRef.current = art

    return () => {
      if (artRef.current) {
        if (artRef.current.hls) {
          artRef.current.hls.destroy()
        }
        artRef.current.destroy()
        artRef.current = null
      }
    }
  }, [channel])

  return (
    <div className={`relative overflow-hidden rounded-xl bg-black ${className || ''}`}>
      <div ref={containerRef} className="size-full min-h-[300px]" />

      {!channel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 text-zinc-400">
          <Tv className="mb-3 size-12 opacity-60" />
          <p className="text-sm font-medium">请从频道列表选择直播频道</p>
        </div>
      )}

      {hasError && channel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-4 text-center">
          <AlertCircle className="mb-2 size-10 text-red-500" />
          <p className="text-sm font-semibold text-white">{errorMessage || '播放失败'}</p>
          <p className="mt-1 text-xs text-zinc-400">请检查网络代理配置或尝试其他频道</p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetry}
            className="mt-4 gap-1.5 border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white"
          >
            <RefreshCw className="size-3.5" />
            重试连接
          </Button>
        </div>
      )}
    </div>
  )
}
