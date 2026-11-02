import { useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  Popcorn,
  Users,
  Copy,
  Check,
  LogOut,
  Play,
  Sparkles,
  X,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { useWatchPartyStore } from '../store/watchPartyStore'
import { WatchPartyChatOverlay } from './WatchPartyChatOverlay'

export function GlobalWatchPartyPill() {
  const location = useLocation()
  const navigate = useNavigate()

  const isPartyActive = useWatchPartyStore(s => s.isPartyActive)
  const isHost = useWatchPartyStore(s => s.isHost)
  const mode = useWatchPartyStore(s => s.mode)
  const roomId = useWatchPartyStore(s => s.roomId)
  const participantCount = useWatchPartyStore(s => s.participantCount)
  const currentMedia = useWatchPartyStore(s => s.currentMedia)
  const isSelectingMedia = useWatchPartyStore(s => s.isSelectingMedia)
  const inviteUrl = useWatchPartyStore(s => s.inviteUrl)
  const messages = useWatchPartyStore(s => s.messages)
  const myClientId = useWatchPartyStore(s => s.myClientId)
  const danmakuEnabled = useWatchPartyStore(s => s.danmakuEnabled)
  const setDanmakuEnabled = useWatchPartyStore(s => s.setDanmakuEnabled)
  const sendChatMessage = useWatchPartyStore(s => s.sendChatMessage)
  const leaveParty = useWatchPartyStore(s => s.leaveParty)

  const [isExpanded, setIsExpanded] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // Hide the global pill if on player route and not in selection mode (player already has local controls)
  const isPlayerRoute = location.pathname.startsWith('/play')
  const shouldShow = isPartyActive && (!isPlayerRoute || isSelectingMedia)

  const activeMediaTitle = currentMedia?.mediaTitle || ''
  const activeEpisodeTitle = currentMedia?.episodeTitle || ''

  const handleCopyLink = () => {
    if (!inviteUrl) return
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleReturnToPlay = () => {
    if (currentMedia?.playPath) {
      navigate(currentMedia.playPath)
      setIsExpanded(false)
    }
  }

  const handleLeave = async () => {
    setLeaving(true)
    try {
      await leaveParty()
      setIsExpanded(false)
      setIsChatOpen(false)
    } finally {
      setLeaving(false)
    }
  }

  const modeBadgeText = useMemo(() => {
    if (mode === 'guest_cinema') return '专属影厅'
    if (mode === 'collaborative') return '全员自由'
    return '房主主控'
  }, [mode])

  if (!shouldShow) return null

  return (
    <>
      {/* Floating Pill on bottom-right of page */}
      <aside aria-label="全局放映室状态" className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 select-none">
        <div
          onClick={() => setIsExpanded(prev => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setIsExpanded(prev => !prev)
            }
          }}
          className="group flex cursor-pointer items-center gap-2.5 rounded-full border border-amber-500/40 bg-zinc-950/90 px-3.5 py-2 text-xs text-white shadow-2xl backdrop-blur-xl transition-all hover:scale-105 hover:border-amber-400 hover:bg-zinc-900"
        >
          <div className="flex size-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
            <Popcorn className="size-3.5 animate-bounce" />
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-amber-300">
              {isHost ? '放映室进行中' : '一起看'}
            </span>
            <span className="text-zinc-500">·</span>
            <span className="flex items-center gap-1 text-zinc-300">
              <Users className="size-3 text-zinc-400" />
              {participantCount}人
            </span>
            <span className="text-zinc-500">·</span>
            {isSelectingMedia ? (
              <span className="font-medium text-amber-400 animate-pulse">
                选片中 🍿
              </span>
            ) : activeMediaTitle ? (
              <span className="max-w-[120px] truncate text-zinc-200">
                《{activeMediaTitle}》
              </span>
            ) : (
              <span className="text-zinc-400">放映就绪</span>
            )}
          </div>

          {messages.length > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-black">
              {messages.length > 99 ? '99+' : messages.length}
            </span>
          )}
        </div>

        {/* Expanded Management Card */}
        {isExpanded && (
          <div
            className="absolute bottom-12 right-0 w-[min(90vw,340px)] rounded-2xl border border-white/15 bg-zinc-950/95 p-4 text-white shadow-2xl backdrop-blur-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-amber-400" />
                <span className="text-sm font-bold text-zinc-100">
                  放映厅控制台
                </span>
                <Badge
                  variant="outline"
                  className="border-amber-500/40 text-[10px] text-amber-300"
                >
                  {modeBadgeText}
                </Badge>
                {roomId && (
                  <span className="font-mono text-[10px] text-zinc-400">
                    #{roomId.slice(0, 6)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                aria-label="收起面板"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Current Media or Status */}
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              {isSelectingMedia ? (
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                    <span className="size-2 rounded-full bg-amber-400 animate-ping" />
                    正在全站挑片中
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    在网站中浏览并点击任意视频播放，全员好友将自动无缝跟随起播。
                  </p>
                </div>
              ) : activeMediaTitle ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 truncate">
                      《{activeMediaTitle}》
                    </p>
                    {activeEpisodeTitle && (
                      <p className="text-[11px] text-zinc-400 truncate">
                        {activeEpisodeTitle}
                      </p>
                    )}
                  </div>
                  {currentMedia?.playPath && (
                    <Button
                      size="sm"
                      onClick={handleReturnToPlay}
                      className="h-7 shrink-0 rounded-full bg-amber-500 px-2.5 text-xs font-medium text-black hover:bg-amber-400"
                    >
                      <Play className="size-3 mr-1 fill-current" />
                      回到放映
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">放映室已建立，等待选择视频</p>
              )}
            </div>

            {/* In-room Actions */}
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="flex-1 rounded-full border-white/15 bg-white/5 text-xs text-zinc-200 hover:bg-white/10"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-400 mr-1" />
                    已复制链接
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5 mr-1" />
                    邀请好友
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsChatOpen(prev => !prev)}
                className="flex-1 rounded-full border-white/15 bg-white/5 text-xs text-zinc-200 hover:bg-white/10"
              >
                <MessageCircle className="size-3.5 mr-1 text-amber-400" />
                互动吐槽 ({messages.length})
              </Button>
            </div>

            {/* Exit Room Action */}
            <div className="mt-3 border-t border-white/10 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={leaving}
                onClick={handleLeave}
                className="w-full rounded-full border border-red-500/20 bg-red-500/10 text-xs text-red-300 hover:bg-red-500/20 hover:text-red-200"
              >
                <LogOut className="size-3.5 mr-1.5" />
                {isHost ? '解散放映厅' : '退出放映室'}
              </Button>
            </div>
          </div>
        )}
      </aside>

      {/* Persistent Chat Drawer when opened from Global Pill */}
      {isChatOpen && (
        <div className="fixed bottom-24 right-4 md:right-6 z-50">
          <WatchPartyChatOverlay
            playerOverlayContainer={null}
            messages={messages}
            currentUserId={myClientId}
            onSendMessage={sendChatMessage}
            danmakuEnabled={danmakuEnabled}
            onToggleDanmaku={() => setDanmakuEnabled(prev => !prev)}
            isHost={isHost}
            isPlaying={true}
            participantCount={participantCount}
            standalone
            onRequestClose={() => setIsChatOpen(false)}
          />
        </div>
      )}
    </>
  )
}
