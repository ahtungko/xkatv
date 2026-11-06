import { useCallback, useEffect, useRef, useState } from 'react'
import { notificationIdentity, unionEpisodes } from '../lib/seriesNotificationSync'
import { unreadEpisodeNumbers, type SeriesUpdate } from '../lib/seriesTracking'
import { useSeriesUpdatesStore } from '../store/seriesUpdatesStore'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'

/** 已展示的提醒立即保存已读回执，本次页面仍保留提示。 */
export function useSeriesReminderVisit(owner: string | undefined) {
  const [held, setHeld] = useState<Record<string, number[]>>({})
  const previousOwner = useRef(owner)
  useEffect(() => {
    if (previousOwner.current !== owner) {
      previousOwner.current = owner
      setHeld({})
    }
  }, [owner])
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', changed)
    return () => document.removeEventListener('visibilitychange', changed)
  }, [])
  const identity = (key: string, update: SeriesUpdate) =>
    JSON.stringify([owner, notificationIdentity(key, update)?.resourceKey ?? key])
  const numbers = (key: string, update: SeriesUpdate | undefined) => {
    if (!update) return []
    const available = new Set(update.episodes?.map(episode => episode.number))
    return unionEpisodes(
      previousOwner.current === owner ? (held[identity(key, update)] ?? []) : [],
      unreadEpisodeNumbers(update),
    ).filter(number => available.has(number))
  }
  const observe = useCallback(
    (rows: Array<{ key: string; update?: SeriesUpdate }>) => {
      if (!owner || !visible || usePrivateModeStore.getState().isPrivateMode) return
      const cache = useSeriesUpdatesStore.getState()
      if (cache.ownerId !== owner) return
      const additions: Record<string, number[]> = {}
      const receipts: Array<{ key: string; update: SeriesUpdate; numbers: number[] }> = []
      for (const { key, update } of rows) {
        if (!update || update !== cache.entries[key]) continue
        const unread = unreadEpisodeNumbers(update)
        if (!unread.length) continue
        const id = JSON.stringify([owner, notificationIdentity(key, update)?.resourceKey ?? key])
        additions[id] = unread
        receipts.push({ key, update, numbers: unread })
      }
      if (!receipts.length) return
      setHeld(previous => {
        const next = { ...previous }
        for (const [id, numbers] of Object.entries(additions))
          next[id] = unionEpisodes(next[id] ?? [], numbers)
        return next
      })
      cache.markReadMany(owner, receipts)
    },
    [owner, visible],
  )
  const dismiss = (key: string, update: SeriesUpdate) => {
    setHeld(previous => ({ ...previous, [identity(key, update)]: [] }))
    if (owner) useSeriesUpdatesStore.getState().markRead(owner, key, update)
  }
  return { numbers, observe, dismiss }
}
