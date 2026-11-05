import { finiteTime, seekTarget } from '../lib/tvControls'
import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Tv,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  SkipForward,
  SkipBack,
  Power,
  Sparkles,
} from 'lucide-react'
import type { TvCastProgressPayload, TvCastCommandAction } from '../lib/tvCastProtocol'

interface TvCastModalProps {
  isOpen: boolean
  onClose: () => void
  isCasting: boolean
  connectedPin: string
  recentPins: string[]
  remoteState: TvCastProgressPayload
  onConnect: (pin: string) => void
  onSendCommand: (action: TvCastCommandAction, value?: number) => void
  onDisconnect: () => void
  hasPrevEpisode?: boolean
  hasNextEpisode?: boolean
  onPlayPrevEpisode?: () => void
  onPlayNextEpisode?: () => void
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function TvCastModal({
  isOpen,
  onClose,
  isCasting,
  connectedPin,
  recentPins,
  remoteState,
  onConnect,
  onSendCommand,
  onDisconnect,
  hasPrevEpisode,
  hasNextEpisode,
  onPlayPrevEpisode,
  onPlayNextEpisode,
}: TvCastModalProps) {
  const [inputPin, setInputPin] = useState('')
  const [volume, setVolume] = useState(1)
  const currentTime = finiteTime(remoteState.currentTime)
  const duration = finiteTime(remoteState.duration)
  const seek = (value: number) => {
    const target = seekTarget(value, duration)
    if (target !== null) onSendCommand('seek', target)
  }

  useEffect(() => {
    if (connectedPin) {
      setInputPin(connectedPin)
    }
  }, [connectedPin])

  const handleConnect = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (inputPin.trim().length === 4) {
      onConnect(inputPin.trim())
    }
  }

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol)
    onSendCommand('volume', newVol)
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent
        onKeyDownCapture={event => {
          if (!isCasting || (event.code !== 'Space' && event.key !== ' ')) return
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('input,textarea,select,[contenteditable="true"]')
          )
            return
          event.preventDefault()
          event.stopPropagation()
          if (!event.repeat) onSendCommand('toggle')
        }}
        className="max-w-md rounded-3xl border-zinc-800 bg-zinc-950 p-6 text-white shadow-2xl"
      >
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/15 text-blue-400">
              <Tv className="size-4" />
            </div>
            <DialogTitle className="text-lg font-bold">
              {isCasting ? '大屏电视遥控器' : '投屏到电视'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-zinc-400">
            {isCasting ? '使用手机控制播放进度与剧集切换' : '电视内置浏览器打开网页即可全屏投映'}
          </DialogDescription>
        </DialogHeader>

        {isCasting ? (
          /* ==================== 遥控板模式 ==================== */
          <div className="space-y-5 pt-2">
            {/* 状态徽标与设备 */}
            <div className="flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-zinc-200">已连接至电视</p>
                  <p className="text-[11px] text-zinc-400">配对码: {connectedPin}</p>
                </div>
              </div>

              <Button
                variant="destructive"
                size="sm"
                onClick={onDisconnect}
                className="h-7 gap-1.5 rounded-full border border-red-500/30 bg-red-600/20 px-3 text-xs text-red-400 transition-all hover:bg-red-600 hover:text-white"
              >
                <Power className="size-3.5" />
                断开投屏
              </Button>
            </div>

            {/* 正在播放的内容卡片 */}
            <div className="space-y-3 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/30 via-zinc-900 to-zinc-900/60 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-blue-400">
                <Sparkles className="size-3.5" />
                <span>电视端正在播放</span>
              </div>
              <div>
                <h3 className="line-clamp-1 text-base font-bold text-zinc-100">
                  {remoteState.mediaTitle || '等待选片'}
                </h3>
                <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">
                  {remoteState.episodeTitle || '选好视频后点击「在电视播放」'}
                </p>
              </div>

              {/* 进度显示条 */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
                  <span>{formatTime(remoteState.currentTime)}</span>
                  <span>{formatTime(remoteState.duration)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  disabled={!duration}
                  value={Math.min(currentTime, duration)}
                  onChange={e => seek(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-blue-500"
                />
              </div>
            </div>

            {/* 核心大按键播控区 */}
            <div className="flex items-center justify-center gap-6 py-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={!duration}
                onClick={() => seek(currentTime - 15)}
                className="size-12 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                title="快退 15 秒"
              >
                <RotateCcw className="size-5" />
              </Button>

              <Button
                variant="default"
                size="icon"
                onClick={() => onSendCommand('toggle')}
                className="size-16 rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 transition-all hover:bg-blue-500 active:scale-95"
                title={remoteState.isPlaying ? '暂停' : '播放'}
              >
                {remoteState.isPlaying ? (
                  <Pause className="size-7 fill-current" />
                ) : (
                  <Play className="ml-0.5 size-7 fill-current" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => seek(currentTime + 15)}
                className="size-12 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                title="快进 15 秒"
                disabled={!duration}
              >
                <RotateCw className="size-5" />
              </Button>
            </div>

            {/* 次级按键区：切集 */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrevEpisode}
                onClick={onPlayPrevEpisode}
                className="h-9 gap-1.5 rounded-xl border-zinc-800 bg-zinc-900/60 text-xs"
              >
                <SkipBack className="size-3.5" />
                上一集
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!hasNextEpisode}
                onClick={onPlayNextEpisode}
                className="h-9 gap-1.5 rounded-xl border-zinc-800 bg-zinc-900/60 text-xs"
              >
                <SkipForward className="size-3.5" />
                下一集
              </Button>
            </div>

            {/* 音量控制 */}
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-3 text-xs text-zinc-400">
              <Volume2 className="size-4 shrink-0 text-zinc-400" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={e => handleVolumeChange(Number(e.target.value))}
                className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-blue-500"
              />
              <span className="w-8 text-right font-mono text-[11px]">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>
        ) : (
          /* ==================== 配对输入模式 ==================== */
          <div className="space-y-5 pt-3">
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300">
                  输入电视屏幕上的 4 位配对码：
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    maxLength={4}
                    placeholder="例如 7829"
                    value={inputPin}
                    onChange={e => setInputPin(e.target.value.toUpperCase())}
                    className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 text-center text-xl font-bold tracking-widest uppercase focus:border-blue-500"
                    autoFocus
                  />
                  <Button
                    type="submit"
                    disabled={inputPin.trim().length !== 4}
                    className="h-12 shrink-0 rounded-2xl bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-500"
                  >
                    连接投屏
                  </Button>
                </div>
              </div>
            </form>

            {/* 最近连接的设备列表 */}
            {recentPins.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-medium text-zinc-500">最近连接过的电视：</span>
                <div className="flex flex-wrap gap-2">
                  {recentPins.map(p => (
                    <Button
                      key={p}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInputPin(p)
                        onConnect(p)
                      }}
                      className="h-7 gap-1.5 rounded-full border-zinc-800 bg-zinc-900/60 px-3 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      <Tv className="size-3 text-blue-400" />
                      <span>{p}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* 3 步使用指引 */}
            <div className="space-y-2.5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-4 text-xs text-zinc-400">
              <p className="flex items-center gap-1.5 font-semibold text-zinc-300">
                <Sparkles className="size-3.5 text-blue-400" />
                如何使用？
              </p>
              <div className="space-y-1.5 pl-1 leading-relaxed">
                <p>1. 在电视主页打开自带的「网络浏览器」。</p>
                <p>
                  2. 输入专属接收网址：
                  <span className="ml-1 font-mono font-medium text-blue-400">
                    {typeof window !== 'undefined' ? `${window.location.host}/tv` : '/tv'}
                  </span>
                </p>
                <p>3. 输入配对码，在电视确认连接后选择视频，再点击「在电视播放」。</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
