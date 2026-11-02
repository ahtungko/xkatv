import { useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type Artplayer from 'artplayer'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'
import {
  useWatchPartyStore,
  readHostSession,
  setWatchPartyNoticeHandler,
  getUserExitedRoomId,
  setUserExitedRoomId,
  type WatchPartyMode,
} from '../store/watchPartyStore'

export type {
  WatchPartyMode,
  WatchPartyAction,
  WatchPartyActionType,
  WatchPartyChatMessage,
  WatchPartyParticipant,
  WatchPartyMediaState,
} from '../store/watchPartyStore'

interface UseWatchPartyOptions {
  art: Artplayer | null
  selectedEpisode: number
  onSelectEpisode: (index: number) => void
  showNotice: (msg: string) => void
  currentVideoUrl?: string
  mediaTitle?: string
  episodeTitle?: string
  posterUrl?: string
  adFilteringEnabled?: boolean
}

export function useWatchParty({
  art,
  selectedEpisode,
  onSelectEpisode,
  showNotice,
  currentVideoUrl,
  mediaTitle,
  episodeTitle,
  posterUrl,
  adFilteringEnabled,
}: UseWatchPartyOptions) {
  const [searchParams, setSearchParams] = useSearchParams()
  const accountUsername = useAuthStore(state => state.account?.username)
  const accountId = useAuthStore(state => state.account?.id)

  const isPartyActive = useWatchPartyStore(state => state.isPartyActive)
  const isHost = useWatchPartyStore(state => state.isHost)
  const mode = useWatchPartyStore(state => state.mode)
  const roomId = useWatchPartyStore(state => state.roomId)
  const participants = useWatchPartyStore(state => state.participants)
  const messages = useWatchPartyStore(state => state.messages)
  const myClientId = useWatchPartyStore(state => state.myClientId)
  const danmakuEnabled = useWatchPartyStore(state => state.danmakuEnabled)
  const isModalOpen = useWatchPartyStore(state => state.isModalOpen)
  const inviteUrl = useWatchPartyStore(state => state.inviteUrl)
  const isSelectingMedia = useWatchPartyStore(state => state.isSelectingMedia)

  const setDanmakuEnabled = useWatchPartyStore(state => state.setDanmakuEnabled)
  const setIsModalOpen = useWatchPartyStore(state => state.setIsModalOpen)
  const storeCreateParty = useWatchPartyStore(state => state.createParty)
  const storeLeaveParty = useWatchPartyStore(state => state.leaveParty)
  const storeConnectToRoom = useWatchPartyStore(state => state.connectToRoom)
  const sendChatMessage = useWatchPartyStore(state => state.sendChatMessage)
  const broadcastAction = useWatchPartyStore(state => state.broadcastAction)
  const bindPlayer = useWatchPartyStore(state => state.bindPlayer)

  const isSupabaseAvailable = Boolean(syncClient)
  const userExitedRoomIdRef = useRef<string | null>(null)

  useEffect(() => {
    setWatchPartyNoticeHandler(showNotice)
    return () => {
      setWatchPartyNoticeHandler(null)
    }
  }, [showNotice])

  // Bind active player whenever art/videoUrl/episode changes
  useEffect(() => {
    if (!art) return

    const unbind = bindPlayer({
      art,
      selectedEpisode,
      onSelectEpisode,
      showNotice,
      mediaTitle,
      episodeTitle,
      currentVideoUrl,
      posterUrl,
      adFilteringEnabled,
      playPath: window.location.pathname + window.location.search,
    })

    return () => {
      unbind()
    }
  }, [
    art,
    selectedEpisode,
    onSelectEpisode,
    showNotice,
    mediaTitle,
    episodeTitle,
    currentVideoUrl,
    posterUrl,
    adFilteringEnabled,
    bindPlayer,
  ])

  // Create party wrapper
  const createParty = useCallback(
    async (selectedMode: WatchPartyMode): Promise<string> => {
      const fullUrl = await storeCreateParty(selectedMode)
      const currentRoomId = useWatchPartyStore.getState().roomId

      if (currentRoomId) {
        setSearchParams(
          prev => {
            const next = new URLSearchParams(prev)
            next.set('partyRoom', currentRoomId)
            next.set('partyMode', selectedMode)
            next.set('partyEp', String(selectedEpisode))
            if (accountUsername) next.set('inviter', accountUsername)
            return next
          },
          { replace: true },
        )
      }

      return fullUrl
    },
    [accountUsername, selectedEpisode, setSearchParams, storeCreateParty],
  )

  // Leave party wrapper
  const leaveParty = useCallback(async (): Promise<boolean> => {
    const currentRoom = useWatchPartyStore.getState().roomId || searchParams.get('partyRoom')
    setUserExitedRoomId(currentRoom)
    const success = await storeLeaveParty()
    if (success) {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          next.delete('partyRoom')
          next.delete('partyMode')
          next.delete('partyEp')
          next.delete('inviter')
          next.delete('partyInviter')
          next.delete('poster')
          return next
        },
        { replace: true },
      )
    }
    return success
  }, [searchParams, setSearchParams, storeLeaveParty])

  // Auto-connect if URL has partyRoom or hostSession is present
  useEffect(() => {
    const urlRoomId = searchParams.get('partyRoom')
    const urlMode = (searchParams.get('partyMode') as WatchPartyMode) || 'host_only'
    const urlEp = searchParams.get('partyEp')

    if (!urlRoomId) {
      setUserExitedRoomId(null)
      return
    }

    if (getUserExitedRoomId() === urlRoomId) return

    if (urlEp !== null) {
      const epIndex = Number(urlEp)
      if (Number.isInteger(epIndex) && epIndex >= 0 && epIndex !== selectedEpisode) {
        onSelectEpisode(epIndex)
      }
    }

    if (!isPartyActive && syncClient) {
      const hostSession = readHostSession()
      const restoreHost =
        !!accountId &&
        hostSession?.accountId === accountId &&
        hostSession.roomId === urlRoomId

      let cancelled = false
      void (async () => {
        try {
          const { data, error } = await syncClient.rpc('watch_party_room_status', {
            p_room_id: urlRoomId,
          })
          if (error) throw new Error(error.message)
          if (cancelled) return
          if (data !== 'open') {
            userExitedRoomIdRef.current = urlRoomId
            showNotice('该放映室已失效或房主已解散')
            return
          }
          storeConnectToRoom(urlRoomId, urlMode, restoreHost)
          const urlInviter = searchParams.get('inviter') || searchParams.get('partyInviter')
          if (urlInviter && !restoreHost) {
            showNotice(`👋「${urlInviter}」邀请你加入了放映室`)
          }
        } catch {
          if (!cancelled) {
            userExitedRoomIdRef.current = urlRoomId
            showNotice('无法验证放映室状态，请检查网络后刷新重试')
          }
        }
      })()

      return () => {
        cancelled = true
      }
    }
  }, [
    accountId,
    isPartyActive,
    onSelectEpisode,
    searchParams,
    selectedEpisode,
    showNotice,
    storeConnectToRoom,
  ])

  // Welcome notice when joining with inviter
  useEffect(() => {
    const urlInviter = searchParams.get('inviter') || searchParams.get('partyInviter')
    if (urlInviter && !isHost && isPartyActive) {
      showNotice(`你已加入「${urlInviter}」的同步放映室 🍿`)
    }
  }, [isHost, isPartyActive, searchParams, showNotice])

  return {
    isPartyActive,
    isHost,
    mode,
    roomId,
    participants,
    participantCount: Math.max(participants.length, isPartyActive ? 1 : 0),
    isModalOpen,
    setIsModalOpen,
    inviteUrl,
    inviterName: accountUsername || null,
    posterUrl: posterUrl || null,
    isSupabaseAvailable,
    messages,
    myClientId,
    danmakuEnabled,
    setDanmakuEnabled,
    sendChatMessage,
    createParty,
    leaveParty,
    broadcastAction,
    isSelectingMedia,
  }
}
