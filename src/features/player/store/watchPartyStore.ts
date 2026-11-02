import { create } from 'zustand'
import type Artplayer from 'artplayer'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'
import type { Account } from '../../../../shared/account-rules'
import { isWatchPartyChatMessage } from '../lib/watchPartyChat'

export type WatchPartyMode = 'host_only' | 'collaborative' | 'guest_cinema'

export type WatchPartyActionType =
  | 'play'
  | 'pause'
  | 'seek'
  | 'episode'
  | 'heartbeat'
  | 'request_state'
  | 'state_sync'
  | 'room_closed'

export interface WatchPartyAction {
  type: WatchPartyActionType
  time: number
  episodeIndex?: number
  videoUrl?: string
  mediaTitle?: string
  episodeTitle?: string
  posterUrl?: string
  adFilteringEnabled?: boolean
  mode?: WatchPartyMode
  senderId?: string
  senderName?: string
  isPlaying?: boolean
  message?: string
  isSelectingMedia?: boolean
}

export interface WatchPartyChatMessage {
  id: string
  senderId: string
  senderName: string
  isHost?: boolean
  text: string
  timestamp: number
}

export interface WatchPartyParticipant {
  id: string
  name: string
  isHost: boolean
}

export interface WatchPartyMediaState {
  videoUrl?: string
  mediaTitle?: string
  episodeTitle?: string
  episodeIndex?: number
  posterUrl?: string
  adFilteringEnabled?: boolean
  playPath?: string
  isPlaying?: boolean
  time?: number
}

export interface PlayerBinding {
  art: Artplayer
  selectedEpisode: number
  onSelectEpisode: (index: number) => void
  showNotice: (msg: string) => void
  mediaTitle?: string
  episodeTitle?: string
  currentVideoUrl?: string
  posterUrl?: string
  adFilteringEnabled?: boolean
  playPath?: string
}

export const HOST_SESSION_KEY = 'xkatv-watch-party-host'

export function readHostSession(): {
  roomId: string
  accountId: string
  mode: WatchPartyMode
} | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(HOST_SESSION_KEY) || 'null')
    return value &&
      typeof value.roomId === 'string' &&
      typeof value.accountId === 'string' &&
      (value.mode === 'host_only' ||
        value.mode === 'collaborative' ||
        value.mode === 'guest_cinema')
      ? value
      : null
  } catch {
    return null
  }
}

export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function getCurrentAccount(): Account | null {
  try {
    const store = useAuthStore as unknown as {
      getState?: () => { account?: Account | null }
      <T>(selector: (state: { account?: Account | null }) => T): T
    }
    if (typeof store.getState === 'function') {
      return store.getState().account ?? null
    }
    return store(s => s.account) ?? null
  } catch {
    return null
  }
}

interface WatchPartyStoreState {
  isPartyActive: boolean
  isHost: boolean
  mode: WatchPartyMode
  roomId: string | null
  participants: WatchPartyParticipant[]
  participantCount: number
  messages: WatchPartyChatMessage[]
  danmakuEnabled: boolean
  isModalOpen: boolean
  inviteUrl: string
  inviterName: string | null
  isSelectingMedia: boolean
  currentMedia: WatchPartyMediaState | null

  // Internal references
  myClientId: string
  channel: ReturnType<NonNullable<typeof syncClient>['channel']> | null

  // Actions
  setDanmakuEnabled: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setIsModalOpen: (open: boolean) => void
  createParty: (selectedMode: WatchPartyMode) => Promise<string>
  leaveParty: () => Promise<boolean>
  connectToRoom: (targetRoomId: string, roomMode: WatchPartyMode, asHost: boolean) => void
  sendChatMessage: (text: string) => Promise<boolean>
  broadcastAction: (action: Omit<WatchPartyAction, 'senderId' | 'senderName'>) => void
  bindPlayer: (binding: PlayerBinding) => () => void
  restoreHostSessionIfNeeded: () => Promise<boolean>
}

let activePlayerBinding: PlayerBinding | null = null
let isRemoteEvent = false
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let hostMissingTimer: ReturnType<typeof setTimeout> | null = null
let userExitedRoomId: string | null = null
let noticeHandler: ((msg: string) => void) | null = null
let pendingInitialSync: WatchPartyAction | null = null
let pendingHostRestore: Promise<boolean> | null = null

export function setWatchPartyNoticeHandler(handler: ((msg: string) => void) | null) {
  noticeHandler = handler
}

export function getUserExitedRoomId(): string | null {
  return userExitedRoomId
}

export function setUserExitedRoomId(id: string | null) {
  userExitedRoomId = id
}

export function triggerNotice(msg: string) {
  if (noticeHandler) {
    noticeHandler(msg)
  } else if (activePlayerBinding?.showNotice) {
    activePlayerBinding.showNotice(msg)
  }
}

export function resetWatchPartyStore() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (hostMissingTimer) {
    clearTimeout(hostMissingTimer)
    hostMissingTimer = null
  }
  activePlayerBinding = null
  isRemoteEvent = false
  userExitedRoomId = null
  noticeHandler = null
  pendingInitialSync = null
  pendingHostRestore = null

  useWatchPartyStore.setState({
    isPartyActive: false,
    isHost: false,
    mode: 'host_only',
    roomId: null,
    participants: [],
    participantCount: 0,
    messages: [],
    danmakuEnabled: true,
    isModalOpen: false,
    inviteUrl: '',
    inviterName: null,
    isSelectingMedia: false,
    currentMedia: null,
    channel: null,
  })
}

export const useWatchPartyStore = create<WatchPartyStoreState>((set, get) => {
  const initialClientId = `user_${Math.random().toString(36).substring(2, 8)}`

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function startHeartbeat(_roomId: string, mode: WatchPartyMode) {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      const state = get()
      if (!state.isPartyActive || !state.isHost || !state.channel) {
        stopHeartbeat()
        return
      }

      if (activePlayerBinding && activePlayerBinding.art) {
        const player = activePlayerBinding.art
        const currentTime = player.currentTime || 0
        const isPlaying = !player.video?.paused

        state.broadcastAction({
          type: 'heartbeat',
          time: currentTime,
          isPlaying,
          videoUrl: activePlayerBinding.currentVideoUrl,
          mediaTitle: activePlayerBinding.mediaTitle,
          episodeTitle: activePlayerBinding.episodeTitle,
          episodeIndex: activePlayerBinding.selectedEpisode,
          posterUrl: activePlayerBinding.posterUrl,
          adFilteringEnabled: activePlayerBinding.adFilteringEnabled,
          mode,
          isSelectingMedia: false,
        })
      } else {
        // Host is browsing other pages / selecting media
        state.broadcastAction({
          type: 'heartbeat',
          time: 0,
          isPlaying: false,
          isSelectingMedia: true,
          mode,
        })
      }
    }, 2000)
  }

  function applyPendingSync() {
    const action = pendingInitialSync
    const binding = activePlayerBinding
    if (!action || !binding) return
    if (typeof action.episodeIndex === 'number' && action.episodeIndex !== binding.selectedEpisode) {
      binding.onSelectEpisode(action.episodeIndex)
      return
    }
    const player = binding.art
    if (!player.isReady && typeof player.once === 'function') {
      player.once('ready', () => {
        if (activePlayerBinding === binding) applyPendingSync()
      })
      return
    }
    pendingInitialSync = null
    isRemoteEvent = true
    player.currentTime = action.time || 0
    if (action.isPlaying) void player.play().catch(() => {})
    else if (action.isPlaying === false) player.pause()
    setTimeout(() => { isRemoteEvent = false }, 600)
  }

  return {
    isPartyActive: false,
    isHost: false,
    mode: 'host_only',
    roomId: null,
    participants: [],
    participantCount: 0,
    messages: [],
    danmakuEnabled: true,
    isModalOpen: false,
    inviteUrl: '',
    inviterName: null,
    isSelectingMedia: false,
    currentMedia: null,
    myClientId: initialClientId,
    channel: null,

    setDanmakuEnabled: enabled => {
      set(state => ({
        danmakuEnabled:
          typeof enabled === 'function' ? enabled(state.danmakuEnabled) : enabled,
      }))
    },

    setIsModalOpen: open => {
      set({ isModalOpen: open })
    },

    restoreHostSessionIfNeeded: async () => {
      const state = get()
      if (state.isPartyActive) return true
      const hostSession = readHostSession()
      const account = getCurrentAccount()
      if (!hostSession || !account || hostSession.accountId !== account.id || !syncClient) return false
      if (pendingHostRestore) return pendingHostRestore
      const client = syncClient
      const restore = (async () => {
        try {
          const { data, error } = await client.rpc('watch_party_room_status', { p_room_id: hostSession.roomId })
          if (error) throw new Error(error.message)
          if (get().isPartyActive) return get().roomId === hostSession.roomId && get().isHost
          if (getCurrentAccount()?.id !== account.id || readHostSession()?.roomId !== hostSession.roomId) return false
          if (data !== 'open') {
            sessionStorage.removeItem(HOST_SESSION_KEY)
            userExitedRoomId = hostSession.roomId
            return false
          }
          get().connectToRoom(hostSession.roomId, hostSession.mode, true)
          return true
        } catch {
          triggerNotice('无法验证放映室状态，请检查网络后刷新重试')
          return false
        }
      })()
      pendingHostRestore = restore
      try { return await restore } finally { if (pendingHostRestore === restore) pendingHostRestore = null }
    },

    createParty: async (selectedMode: WatchPartyMode) => {
      const account = getCurrentAccount()
      const accountId = account?.id
      const accountUsername = account?.username

      const newRoomId = generateRoomId()
      userExitedRoomId = null

      if (accountId && syncClient) {
        try {
          const { error } = await syncClient.rpc('create_watch_party_room', {
            p_room_id: newRoomId,
            p_mode: selectedMode,
          })
          if (error) throw new Error(error.message)
        } catch (error) {
          throw new Error(
            `无法在服务端登记放映厅：${error instanceof Error ? error.message : String(error)}`,
          )
        }

        try {
          sessionStorage.setItem(
            HOST_SESSION_KEY,
            JSON.stringify({
              roomId: newRoomId,
              accountId,
              mode: selectedMode,
            }),
          )
        } catch {
          // ignore session storage restrictions
        }
      }

      get().connectToRoom(newRoomId, selectedMode, true)

      const inviter = accountUsername || ''
      let fullUrl = ''
      if (selectedMode === 'guest_cinema') {
        const params = new URLSearchParams()
        if (inviter) params.set('i', inviter)
        const qs = params.toString() ? `?${params.toString()}` : ''
        fullUrl = `${window.location.origin}/p/${newRoomId}${qs}`
      } else {
        const url = new URL(window.location.href)
        url.searchParams.set('partyRoom', newRoomId)
        url.searchParams.set('partyMode', selectedMode)
        if (inviter) url.searchParams.set('inviter', inviter)
        url.searchParams.delete('poster')
        fullUrl = url.toString()
      }

      set({
        inviteUrl: fullUrl,
        inviterName: inviter || null,
      })

      return fullUrl
    },

    connectToRoom: (targetRoomId: string, roomMode: WatchPartyMode, asHost: boolean) => {
      userExitedRoomId = null
      pendingInitialSync = null
      if (!syncClient) return

      // Clean existing channel if any
      const existingChannel = get().channel
      if (existingChannel) {
        stopHeartbeat()
        if (hostMissingTimer) clearTimeout(hostMissingTimer)
        hostMissingTimer = null
        void existingChannel.unsubscribe()
        void syncClient.removeChannel(existingChannel)
      }

      const channelName = `watch_party_${targetRoomId}`
      const myClientId = get().myClientId
      const accountUsername = getCurrentAccount()?.username
      const currentUsername =
        accountUsername || `访客_${myClientId.substring(5)}`

      const channel = syncClient.channel(channelName, {
        config: {
          broadcast: { self: false },
          presence: { key: myClientId },
        },
      })

      const inviter = accountUsername || ''
      let fullUrl = ''
      if (roomMode === 'guest_cinema') {
        const params = new URLSearchParams()
        if (inviter) params.set('i', inviter)
        const qs = params.toString() ? `?${params.toString()}` : ''
        fullUrl = `${window.location.origin}/p/${targetRoomId}${qs}`
      } else {
        try {
          const url = new URL(window.location.href)
          url.searchParams.set('partyRoom', targetRoomId)
          url.searchParams.set('partyMode', roomMode)
          if (inviter) url.searchParams.set('inviter', inviter)
          fullUrl = url.toString()
        } catch {
          fullUrl = `${window.location.origin}/?partyRoom=${targetRoomId}`
        }
      }

      set({
        roomId: targetRoomId,
        mode: roomMode,
        isHost: asHost,
        isPartyActive: true,
        channel,
        messages: [],
        inviteUrl: fullUrl,
        inviterName: inviter || null,
        isSelectingMedia: asHost && !activePlayerBinding,
      })

      // Listen for control actions
      channel.on('broadcast', { event: 'party_action' }, ({ payload }) => {
        const action = payload as WatchPartyAction
        if (!action || action.senderId === myClientId) return

        if (action.type === 'room_closed' && !asHost) {
          userExitedRoomId = targetRoomId
          void get().leaveParty()
          triggerNotice(action.message || '房主已解散放映厅')
          return
        }

        // Handle newcomer asking for the current state (Host answers)
        if (action.type === 'request_state') {
          if (asHost) {
            if (activePlayerBinding && activePlayerBinding.art) {
              const player = activePlayerBinding.art
              void channel.send({
                type: 'broadcast',
                event: 'party_action',
                payload: {
                  type: 'state_sync',
                  time: player.currentTime || 0,
                  isPlaying: !player.video?.paused,
                  episodeIndex: activePlayerBinding.selectedEpisode,
                  videoUrl: activePlayerBinding.currentVideoUrl,
                  mediaTitle: activePlayerBinding.mediaTitle,
                  episodeTitle: activePlayerBinding.episodeTitle,
                  posterUrl: activePlayerBinding.posterUrl,
                  adFilteringEnabled: activePlayerBinding.adFilteringEnabled,
                  mode: roomMode,
                  senderId: myClientId,
                  senderName: currentUsername,
                  isSelectingMedia: false,
                },
              })
            } else {
              // Host is selecting media
              void channel.send({
                type: 'broadcast',
                event: 'party_action',
                payload: {
                  type: 'state_sync',
                  time: 0,
                  isPlaying: false,
                  mode: roomMode,
                  senderId: myClientId,
                  senderName: currentUsername,
                  isSelectingMedia: true,
                },
              })
            }
          }
          return
        }

        if (action.type === 'state_sync' && !asHost && !action.isSelectingMedia) {
          pendingInitialSync = action
          applyPendingSync()
          return
        }

        // Apply actions to the active player if registered
        if (!activePlayerBinding || !activePlayerBinding.art) return
        const player = activePlayerBinding.art

        isRemoteEvent = true
        try {
          switch (action.type) {
            case 'play': {
              player.currentTime = action.time
              void player.play().catch(() => {})
              break
            }
            case 'pause': {
              player.currentTime = action.time
              player.pause()
              break
            }
            case 'seek': {
              player.currentTime = action.time
              break
            }
            case 'episode': {
              if (
                typeof action.episodeIndex === 'number' &&
                action.episodeIndex !== activePlayerBinding.selectedEpisode
              ) {
                triggerNotice(
                  `[一起看] ${action.senderName || '房主'} 切换到了第 ${action.episodeIndex + 1} 集`,
                )
                activePlayerBinding.onSelectEpisode(action.episodeIndex)
              }
              break
            }
            case 'heartbeat': {
              if (!asHost) {
                const current = player.currentTime || 0
                const diff = Math.abs(current - action.time)
                if (diff > 2.5) {
                  player.currentTime = action.time
                }
                if (action.isPlaying && player.video && player.video.paused) {
                  void player.play().catch(() => {})
                } else if (!action.isPlaying && player.video && !player.video.paused) {
                  player.pause()
                }
              }
              break
            }
          }
        } finally {
          setTimeout(() => {
            isRemoteEvent = false
          }, 600)
        }
      })

      // Listen for chat messages
      channel.on('broadcast', { event: 'party_chat' }, ({ payload }) => {
        if (!isWatchPartyChatMessage(payload) || payload.senderId === myClientId) return
        set(state => ({
          messages: [...state.messages.slice(-99), payload],
        }))
      })

      // Listen for presence changes
      channel.on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState()
        const userList: WatchPartyParticipant[] = []
        Object.values(presenceState).forEach(items => {
          ;(items as Array<Record<string, unknown>>).forEach(item => {
            userList.push({
              id: String(item.clientId || ''),
              name: String(item.name || '观众'),
              isHost: Boolean(item.isHost),
            })
          })
        })

        set({
          participants: userList,
          participantCount: Math.max(userList.length, 1),
        })

        if (!asHost) {
          const hasHost = userList.some(u => u.isHost)
          if (!hasHost) {
            if (!hostMissingTimer) {
              hostMissingTimer = setTimeout(() => {
                hostMissingTimer = null
                userExitedRoomId = targetRoomId
                void get().leaveParty()
                triggerNotice('房主已离线超时，放映厅已关闭')
              }, 30000)
            }
          } else if (hostMissingTimer) {
            clearTimeout(hostMissingTimer)
            hostMissingTimer = null
          }
        }
      })

      // Subscribe and announce presence
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          void channel.track({
            clientId: myClientId,
            name: currentUsername,
            isHost: asHost,
          })

          const modeLabel =
            roomMode === 'host_only'
              ? '房主主控'
              : roomMode === 'collaborative'
                ? '全员自由'
                : '免登录专属影厅'

          triggerNotice(
            asHost ? `放映室已建立 (${modeLabel})` : `已加入放映室 (${modeLabel})`,
          )

          if (!asHost) {
            void channel.send({
              type: 'broadcast',
              event: 'party_action',
              payload: {
                type: 'request_state',
                senderId: myClientId,
                senderName: currentUsername,
              },
            })
          } else {
            startHeartbeat(targetRoomId, roomMode)
          }
        }
      })
    },

    leaveParty: async () => {
      const state = get()
      const leavingRoom = state.roomId
      const wasHost = state.isHost

      if (wasHost && leavingRoom && syncClient) {
        try {
          const { error } = await syncClient.rpc('close_watch_party_room', {
            p_room_id: leavingRoom,
          })
          if (error) throw new Error(error.message)
        } catch (error) {
          triggerNotice(
            `无法关闭放映厅，请重试：${error instanceof Error ? error.message : String(error)}`,
          )
          return false
        }
      }

      stopHeartbeat()
      pendingInitialSync = null
      if (hostMissingTimer) clearTimeout(hostMissingTimer)
      hostMissingTimer = null
      userExitedRoomId = leavingRoom

      try {
        if (readHostSession()?.roomId === leavingRoom) {
          sessionStorage.removeItem(HOST_SESSION_KEY)
        }
      } catch {
        // ignore
      }

      const channel = state.channel
      const client = syncClient
      if (channel && client) {
        const disconnect = () => {
          void channel.unsubscribe()
          void client.removeChannel(channel)
        }
        if (wasHost) {
          void channel
            .send({
              type: 'broadcast',
              event: 'party_action',
              payload: {
                type: 'room_closed',
                time: 0,
                message: '房主已解散放映厅',
                senderId: state.myClientId,
                senderName: getCurrentAccount()?.username || '房主',
              },
            })
            .catch(() => {})
            .finally(disconnect)
        } else {
          disconnect()
        }
      }

      set({
        isPartyActive: false,
        isHost: false,
        roomId: null,
        participants: [],
        participantCount: 0,
        messages: [],
        inviteUrl: '',
        currentMedia: null,
        isSelectingMedia: false,
        channel: null,
      })

      // Clean URL params if in browser
      try {
        const currentUrl = new URL(window.location.href)
        currentUrl.searchParams.delete('partyRoom')
        currentUrl.searchParams.delete('partyMode')
        currentUrl.searchParams.delete('partyEp')
        currentUrl.searchParams.delete('inviter')
        currentUrl.searchParams.delete('partyInviter')
        currentUrl.searchParams.delete('poster')
        window.history.replaceState(null, '', currentUrl.toString())
      } catch {
        // ignore non-browser
      }

      triggerNotice('已退出同步放映室')
      return true
    },

    sendChatMessage: async (text: string) => {
      const trimmed = text.trim()
      const state = get()
      const channel = state.channel
      if (!trimmed || trimmed.length > 100 || !channel || !state.isPartyActive) return false

      const accountUsername = getCurrentAccount()?.username
      const currentUsername =
        accountUsername || `访客_${state.myClientId.substring(5)}`

      const chatMsg: WatchPartyChatMessage = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        senderId: state.myClientId,
        senderName: currentUsername,
        isHost: state.isHost,
        text: trimmed,
        timestamp: Date.now(),
      }

      try {
        const result = await channel.send({
          type: 'broadcast',
          event: 'party_chat',
          payload: chatMsg,
        })
        if (result !== 'ok' || get().channel !== channel) return false
        set(s => ({ messages: [...s.messages.slice(-99), chatMsg] }))
        return true
      } catch {
        return false
      }
    },

    broadcastAction: action => {
      const state = get()
      const channel = state.channel
      if (!channel || !state.isPartyActive || isRemoteEvent) return

      if (
        (state.mode === 'host_only' || state.mode === 'guest_cinema') &&
        !state.isHost &&
        action.type !== 'heartbeat' &&
        action.type !== 'request_state'
      ) {
        triggerNotice('当前为房主主控模式，仅房主可控制进度')
        return
      }

      const accountUsername = getCurrentAccount()?.username
      const currentUsername =
        accountUsername || `访客_${state.myClientId.substring(5)}`

      const fullAction: WatchPartyAction = {
        ...action,
        senderId: state.myClientId,
        senderName: currentUsername,
      }

      void channel.send({
        type: 'broadcast',
        event: 'party_action',
        payload: fullAction,
      })
    },

    bindPlayer: (binding: PlayerBinding) => {
      activePlayerBinding = binding
      const state = get()

      const newMedia: WatchPartyMediaState = {
        videoUrl: binding.currentVideoUrl,
        mediaTitle: binding.mediaTitle,
        episodeTitle: binding.episodeTitle,
        episodeIndex: binding.selectedEpisode,
        posterUrl: binding.posterUrl,
        adFilteringEnabled: binding.adFilteringEnabled,
        playPath: binding.playPath || window.location.pathname + window.location.search,
        isPlaying: !binding.art.video?.paused,
        time: binding.art.currentTime || 0,
      }

      set({
        isSelectingMedia: false,
        currentMedia: newMedia,
      })

      if (!state.isHost) applyPendingSync()

      // If host has an active party and binds a player, broadcast the new video to all guests!
      if (state.isPartyActive && state.isHost && state.channel) {
        state.broadcastAction({
          type: 'episode',
          time: binding.art.currentTime || 0,
          episodeIndex: binding.selectedEpisode,
          videoUrl: binding.currentVideoUrl,
          mediaTitle: binding.mediaTitle,
          episodeTitle: binding.episodeTitle,
          posterUrl: binding.posterUrl,
          adFilteringEnabled: binding.adFilteringEnabled,
          isPlaying: !binding.art.video?.paused,
          isSelectingMedia: false,
        })
      }

      // Attach player event listeners
      const art = binding.art
      const handlePlay = () => {
        if (isRemoteEvent) return
        get().broadcastAction({
          type: 'play',
          time: art.currentTime || 0,
        })
      }

      const handlePause = () => {
        if (isRemoteEvent) return
        get().broadcastAction({
          type: 'pause',
          time: art.currentTime || 0,
        })
      }

      const handleSeeked = () => {
        if (isRemoteEvent) return
        get().broadcastAction({
          type: 'seek',
          time: art.currentTime || 0,
        })
      }

      art.on('video:play', handlePlay)
      art.on('video:pause', handlePause)
      art.on('video:seeked', handleSeeked)

      // Return unbind function
      return () => {
        art.off('video:play', handlePlay)
        art.off('video:pause', handlePause)
        art.off('video:seeked', handleSeeked)
        if (activePlayerBinding === binding) {
          activePlayerBinding = null
          const curr = get()
          if (curr.isPartyActive && curr.isHost) {
            set({ isSelectingMedia: true })
            curr.broadcastAction({
              type: 'heartbeat',
              time: 0,
              isPlaying: false,
              isSelectingMedia: true,
            })
          }
        }
      }
    },
  }
})
