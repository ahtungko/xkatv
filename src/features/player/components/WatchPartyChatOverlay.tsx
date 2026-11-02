import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  MessageCircle,
  EyeOff,
  Radio,
  Send,
  X,
  Crown,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import type { WatchPartyChatMessage } from '../hooks/useWatchParty'

export interface WatchPartyChatOverlayProps {
  playerOverlayContainer: HTMLElement | null
  messages: WatchPartyChatMessage[]
  onSendMessage: (text: string) => Promise<boolean>
  danmakuEnabled: boolean
  onToggleDanmaku: () => void
  isHost?: boolean
  currentUserName?: string
  currentUserId?: string
  isPlaying?: boolean
  participantCount?: number
  standalone?: boolean
  onRequestClose?: () => void
}

interface ActiveDanmakuItem {
  id: string
  messageId: string
  senderName: string
  text: string
  isHost?: boolean
  track: number
}

const QUICK_REACTIONS = [
  { emoji: '🍿', label: '爆米花' },
  { emoji: '❤️', label: '喜欢' },
  { emoji: '🤣', label: '哈哈' },
  { emoji: '👏', label: '鼓掌' },
  { emoji: '🔥', label: '高能' },
  { emoji: '😱', label: '震惊' },
]

const DANMAKU_TRACK_TOPS = ['10%', '22%', '34%', '46%', '58%']

export function WatchPartyChatOverlay({
  playerOverlayContainer,
  messages,
  onSendMessage,
  danmakuEnabled,
  onToggleDanmaku,
  currentUserId,
  isPlaying = true,
  participantCount = 1,
  standalone = false,
  onRequestClose,
}: WatchPartyChatOverlayProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(standalone)
  const [unreadCount, setUnreadCount] = useState(0)
  const seenMessageIdsRef = useRef<Set<string> | null>(null)
  const [controlsVisible, setControlsVisible] = useState(!playerOverlayContainer || playerOverlayContainer.classList.contains('art-control-show'))
  const [videoPaused, setVideoPaused] = useState<boolean | null>(null)
  const [inputText, setInputText] = useState('')
  const [sendError, setSendError] = useState(false)
  const [sending, setSending] = useState(false)
  const [activeDanmakus, setActiveDanmakus] = useState<ActiveDanmakuItem[]>([])
  const processedMessageIdsRef = useRef<Set<string>>(new Set())
  const trackCursorRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const isInitialMountRef = useRef(true)

  useEffect(() => {
    if (!playerOverlayContainer) {
      setControlsVisible(true)
      setVideoPaused(null)
      return
    }
    const updateControls = () => setControlsVisible(playerOverlayContainer.classList.contains('art-control-show'))
    updateControls()
    const observer = new MutationObserver(updateControls)
    observer.observe(playerOverlayContainer, { attributes: true, attributeFilter: ['class'] })
    const video = playerOverlayContainer.querySelector('video')
    const updatePlayback = () => setVideoPaused(video?.paused ?? null)
    updatePlayback()
    video?.addEventListener('play', updatePlayback)
    video?.addEventListener('pause', updatePlayback)
    return () => {
      observer.disconnect()
      video?.removeEventListener('play', updatePlayback)
      video?.removeEventListener('pause', updatePlayback)
    }
  }, [playerOverlayContainer])

  useEffect(() => {
    const previous = seenMessageIdsRef.current
    const next = new Set(messages.map(message => message.id))
    seenMessageIdsRef.current = next
    if (!previous || isDrawerOpen || messages.length === 0) {
      setUnreadCount(0)
      return
    }
    const added = messages.filter(message => !previous.has(message.id) && message.senderId !== currentUserId).length
    if (added) setUnreadCount(count => Math.min(100, count + added))
  }, [messages, isDrawerOpen, currentUserId])

  const showControls = !playerOverlayContainer || controlsVisible || isDrawerOpen || (videoPaused ?? !isPlaying)

  // Listen for new incoming messages and convert to danmaku
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      // Record any pre-existing messages so we don't burst fire them all as danmakus on load
      messages.forEach(m => processedMessageIdsRef.current.add(m.id))
      return
    }

    if (!danmakuEnabled) {
      messages.forEach(message => processedMessageIdsRef.current.add(message.id))
      setActiveDanmakus([])
      return
    }

    const newMessages = messages.filter(
      m => !processedMessageIdsRef.current.has(m.id),
    )

    if (newMessages.length === 0) return

    newMessages.forEach(m => processedMessageIdsRef.current.add(m.id))

    // Take the newest messages (up to 5 per burst to avoid visual flooding)
    const candidates = newMessages.slice(-5)
    const newItems: ActiveDanmakuItem[] = candidates.map(msg => {
      const track = trackCursorRef.current % DANMAKU_TRACK_TOPS.length
      trackCursorRef.current += 1
      return {
        id: `${msg.id}_${Math.random().toString(36).slice(2, 6)}`,
        messageId: msg.id,
        senderName: msg.senderName,
        text: msg.text,
        isHost: msg.isHost,
        track,
      }
    })

    setActiveDanmakus(prev => [...prev.slice(-15), ...newItems])
  }, [messages, danmakuEnabled])

  // Scroll chat messages to bottom when new messages arrive and drawer is open
  useEffect(() => {
    if (isDrawerOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView?.({ behavior: 'smooth' })
    }
  }, [messages.length, isDrawerOpen])

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const sent = await onSendMessage(trimmed)
      setSendError(!sent)
      if (sent) setInputText(current => current.trim() === trimmed ? '' : current)
    } catch { setSendError(true) } finally { setSending(false) }
  }, [inputText, onSendMessage, sending])

  const handleReactionClick = useCallback(
    async (emoji: string) => {
      try { setSendError(!(await onSendMessage(emoji))) } catch { setSendError(true) }
    },
    [onSendMessage],
  )

  const handleRemoveDanmaku = useCallback((id: string) => {
    setActiveDanmakus(prev => prev.filter(item => item.id !== id))
  }, [])

  const overlayContent = useMemo(() => {
    return (
      <div className={`pointer-events-none z-30 select-none overflow-hidden party-danmaku-container ${standalone ? 'relative h-[350px] w-[min(90vw,320px)]' : 'absolute inset-0'}`}>
        {/* Floating Danmaku Bullet Comments */}
        {danmakuEnabled && !standalone && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {activeDanmakus.map(item => (
              <div
                key={item.id}
                className="animate-party-danmaku absolute left-full whitespace-nowrap will-change-transform"
                style={{
                  top: DANMAKU_TRACK_TOPS[item.track] || '20%',
                  animationPlayState: isPlaying ? 'running' : 'paused',
                }}
                onAnimationEnd={() => handleRemoveDanmaku(item.id)}
              >
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/75 px-3 py-1 text-xs sm:text-sm font-medium text-white shadow-xl backdrop-blur-md">
                  {item.isHost && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-black">
                      <Crown className="size-2.5" />
                      房主
                    </span>
                  )}
                  <span className="font-semibold text-zinc-300">
                    {item.senderName}:
                  </span>
                  <span className="text-white drop-shadow-sm">{item.text}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Floating Player Control Pill (Danmaku Toggle & Chat Drawer Toggle) */}
        {!standalone && <div
          data-party-controls
          aria-hidden={!showControls}
          className={`absolute bottom-14 right-3 z-35 flex items-center gap-1 rounded-full border border-white/20 bg-black/75 p-1 shadow-2xl backdrop-blur-md transition-opacity ${showControls ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <button
            type="button"
            onClick={onToggleDanmaku}
            title={danmakuEnabled ? '关闭弹幕' : '开启弹幕'}
            aria-label={danmakuEnabled ? '关闭弹幕' : '开启弹幕'}
            tabIndex={showControls ? 0 : -1}
            className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/15"
          >
            {danmakuEnabled ? (
              <>
                <Radio className="size-4 text-emerald-400" />
              </>
            ) : (
              <>
                <EyeOff className="size-4 text-zinc-400" />
              </>
            )}
          </button>

          <span className="h-3 w-px bg-white/20" />

          <button
            type="button"
            onClick={() => setIsDrawerOpen(prev => !prev)}
            title="放映室聊天"
            aria-label="放映室聊天"
            tabIndex={showControls ? 0 : -1}
            className="flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2 text-white transition-colors hover:bg-white/15"
          >
            <MessageCircle className="size-4 text-amber-400" />
            {unreadCount > 0 && (
              <span data-unread-count className="rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold text-black">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>}

        {/* Floating Chat Drawer Popover */}
        {isDrawerOpen && (
          <div
            className={`pointer-events-auto absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-zinc-950/92 shadow-2xl backdrop-blur-2xl text-white ${standalone ? 'inset-0 h-full w-full' : 'bottom-14 right-3 h-[min(350px,calc(100%-4rem))] w-[min(90vw,320px)]'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5 bg-white/5">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-zinc-100">
                  放映室实时吐槽
                </span>
                <span className="rounded-full border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {participantCount}人在线
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setIsDrawerOpen(false); onRequestClose?.() }}
                className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="关闭聊天面板"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-zinc-500 text-xs py-8">
                  <p>🍿 暂无聊天内容</p>
                  <p className="mt-1 text-[11px]">发条弹幕和朋友一起吐槽吧~</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                      {msg.isHost && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/80 px-1 text-[9px] font-bold text-black">
                          <Crown className="size-2" />
                          房主
                        </span>
                      )}
                      <span className="font-medium text-zinc-300">
                        {msg.senderName}
                      </span>
                      <span className="text-[10px] opacity-60">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-zinc-100 break-words leading-relaxed">
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Reactions */}
            <div className="flex items-center justify-between border-t border-white/10 px-3 py-1.5 bg-white/5">
              {QUICK_REACTIONS.map(reaction => (
                <button
                  key={reaction.emoji}
                  type="button"
                  onClick={() => handleReactionClick(reaction.emoji)}
                  title={reaction.label}
                  className="rounded-lg p-1 text-sm hover:scale-125 transition-transform"
                >
                  {reaction.emoji}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="border-t border-white/10 p-2.5 bg-zinc-900/90">
              {sendError && <p role="alert" className="mb-1 text-xs text-red-300">发送失败，请重试</p>}
              <form
                onSubmit={e => {
                  e.preventDefault()
                  handleSend()
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="发条弹幕吐槽..."
                  maxLength={100}
                  className="h-8 flex-1 rounded-full border-white/15 bg-white/10 px-3 text-xs text-white placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-amber-400"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!inputText.trim() || sending}
                  className="h-8 w-8 rounded-full bg-amber-500 p-0 text-black hover:bg-amber-400 disabled:opacity-40"
                  aria-label="发送消息"
                >
                  <Send className="size-3.5" />
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }, [
    danmakuEnabled,
    activeDanmakus,
    isPlaying,
    messages,
    isDrawerOpen,
    participantCount,
    inputText,
    sendError,
    sending,
    showControls,
    unreadCount,
    standalone,
    onRequestClose,
    onToggleDanmaku,
    handleRemoveDanmaku,
    handleReactionClick,
    handleSend,
  ])

  if (!playerOverlayContainer) {
    return overlayContent
  }

  return createPortal(overlayContent, playerOverlayContainer)
}

export interface WatchPartyInlineBarProps {
  onSendMessage: (text: string) => Promise<boolean>
  danmakuEnabled: boolean
  onToggleDanmaku: () => void
  messagesCount: number
}

/**
 * Inline Quick Chat & Danmaku bar to place right under the player on desktop/laptop.
 */
export function WatchPartyInlineBar({
  onSendMessage,
  danmakuEnabled,
  onToggleDanmaku,
  messagesCount = 0,
}: WatchPartyInlineBarProps) {
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState(false)
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const sent = await onSendMessage(trimmed)
      setSendError(!sent)
      if (sent) setText(current => current.trim() === trimmed ? '' : current)
    } catch { setSendError(true) } finally { setSending(false) }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-900/60 p-2 text-xs shadow-md backdrop-blur-md">
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="发条弹幕一起吐槽（Enter 发送）..."
          maxLength={100}
          className="h-8 flex-1 rounded-full border-white/10 bg-white/5 px-3 text-xs text-white placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-amber-400"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="h-8 rounded-full bg-amber-500 px-3 text-xs text-black hover:bg-amber-400 disabled:opacity-40"
        >
          <Send className="size-3 mr-1" />
          发送
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        {messagesCount > 0 && (
          <span className="hidden sm:inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
            {messagesCount} 条吐槽
          </span>
        )}
        <div className="hidden sm:flex items-center gap-1">
          {QUICK_REACTIONS.slice(0, 4).map(r => (
            <button
              key={r.emoji}
              type="button"
              onClick={() => { void onSendMessage(r.emoji).then(sent => setSendError(!sent)).catch(() => setSendError(true)) }}
              title={r.label}
              className="rounded-lg px-1.5 py-1 text-sm hover:scale-125 transition-transform"
            >
              {r.emoji}
            </button>
          ))}
        </div>

        <span className="hidden sm:inline h-3 w-px bg-white/20" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleDanmaku}
          className="h-8 rounded-full border border-white/10 bg-white/5 px-2.5 text-xs text-zinc-300 hover:bg-white/10"
        >
          {danmakuEnabled ? (
            <>
              <Radio className="size-3 text-emerald-400 mr-1" />
              <span>弹幕开</span>
            </>
          ) : (
            <>
              <EyeOff className="size-3 text-zinc-400 mr-1" />
              <span className="text-zinc-400">弹幕关</span>
            </>
          )}
        </Button>
      </div>
      {sendError && <p role="alert" className="w-full text-xs text-red-300">发送失败，请重试</p>}
    </div>
  )
}
