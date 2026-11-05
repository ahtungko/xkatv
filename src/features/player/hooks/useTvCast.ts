import { useState, useEffect, useRef, useCallback } from 'react'
import { useTvCastStore, registerCastEnded } from '../store/tvCastStore'
import { mediaIdentity } from '../lib/tvCastSession'
import type { TvCastMediaPayload } from '../lib/tvCastProtocol'
export interface UseTvCastProps {
  currentMedia: TvCastMediaPayload | null
  onPauseLocalPlayer?: () => void
  onPlayNextEpisode?: () => void
  onPlayPrevEpisode?: () => void
  getCurrentTime?: () => number
}
export function useTvCast(props: UseTvCastProps) {
  const state = useTvCastStore()
  const latest = useRef(props)
  latest.current = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const following = useRef(false)
  const lastSent = useRef('')
  const lastTitle = useRef('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const castCurrent = useCallback(async () => {
    const media = latest.current.currentMedia
    if (!media) return
    const sent = await useTvCastStore
      .getState()
      .playMedia({ ...media, initialTime: latest.current.getCurrentTime?.() ?? media.initialTime })
    if (sent && mounted.current) {
      following.current = true
      lastTitle.current = media.mediaTitle
      lastSent.current = mediaIdentity(media)
      latest.current.onPauseLocalPlayer?.()
      setIsModalOpen(true)
    }
  }, [])
  useEffect(
    () =>
      registerCastEnded(() => {
        if (following.current) latest.current.onPlayNextEpisode?.()
      }),
    [],
  )
  useEffect(() => {
    if (state.status !== 'connected') {
      following.current = false
      lastSent.current = ''
      return
    }
    const media = props.currentMedia
    if (media && following.current && media.mediaTitle !== lastTitle.current) {
      following.current = false
      return
    }
    if (following.current && media && lastSent.current !== mediaIdentity(media)) void castCurrent()
  }, [props.currentMedia, state.status, castCurrent])
  return {
    isModalOpen,
    setIsModalOpen,
    isCasting: state.status === 'connected',
    connectedPin: state.pin,
    recentPins: [],
    remoteState: state.remoteState,
    connectAndCast: state.connect,
    sendCommand: state.command,
    disconnect: state.disconnect,
    castCurrent,
    onPlayNextEpisode: props.onPlayNextEpisode,
    onPlayPrevEpisode: props.onPlayPrevEpisode,
  }
}
