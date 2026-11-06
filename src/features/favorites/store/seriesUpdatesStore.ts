import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { safeLocalStorage } from '@/shared/lib/safeStorage'
import { mergeSeriesUpdate, unreadEpisodeNumbers, type SeriesUpdate } from '../lib/seriesTracking'
import { useSeriesNotificationsStore, syncedNotificationView } from './seriesNotificationsStore'

export interface SeriesCheckProgress {
  total: number
  completed: number
  failed: number
  cached: number
}

interface SeriesUpdatesStore {
  ownerId: string | null
  entries: Record<string, SeriesUpdate>
  checking: boolean
  checkingKeys: string[]
  checkProgress: SeriesCheckProgress | null
  activeKeys: string[]
  refreshToken: number
  refreshTarget: { key: string; bindingKey: string } | null
  configure: (ownerId: string, keys: string[]) => void
  saveResult: (ownerId: string, key: string, result: SeriesUpdate) => void
  markRead: (ownerId: string, key: string, displayedUpdate: SeriesUpdate) => void
  markEpisodesRead: (
    ownerId: string,
    key: string,
    displayedUpdate: SeriesUpdate,
    numbers: number[],
  ) => void
  markReadMany: (
    ownerId: string,
    rows: Array<{ key: string; update: SeriesUpdate; numbers: number[] }>,
  ) => void
  refresh: () => void
  refreshOne: (ownerId: string, key: string, bindingKey: string) => void
}

export const useSeriesUpdatesStore = create<SeriesUpdatesStore>()(
  persist(
    (set, get) => ({
      ownerId: null,
      entries: {},
      checking: false,
      checkingKeys: [],
      checkProgress: null,
      activeKeys: [],
      refreshToken: 0,
      refreshTarget: null,
      configure: (ownerId, keys) =>
        set(state => ({
          ownerId,
          activeKeys: keys,
          checkProgress: null,
          checkingKeys:
            state.ownerId === ownerId ? state.checkingKeys.filter(key => keys.includes(key)) : [],
          checking: state.ownerId === ownerId && state.checkingKeys.some(key => keys.includes(key)),
          refreshTarget: null,
          entries:
            state.ownerId === ownerId
              ? Object.fromEntries(
                  Object.entries(state.entries).filter(([key]) => keys.includes(key)),
                )
              : {},
        })),
      saveResult: (ownerId, key, result) => {
        const state = get()
        if (state.ownerId !== ownerId) return
        const merged = mergeSeriesUpdate(state.entries[key], result)
        useSeriesNotificationsStore.getState().observe(ownerId, key, merged)
        merged.notification = syncedNotificationView(ownerId, key, merged)
        set({ entries: { ...get().entries, [key]: merged } })
      },
      markRead: (ownerId, key, displayedUpdate) => {
        get().markEpisodesRead(ownerId, key, displayedUpdate, unreadEpisodeNumbers(displayedUpdate))
      },
      markEpisodesRead: (ownerId, key, update, numbers) => {
        get().markReadMany(ownerId, [{ key, update, numbers }])
      },
      markReadMany: (ownerId, rows) => {
        const state = get()
        if (state.ownerId !== ownerId) return
        const entries = { ...state.entries }
        const receipts: Array<{ key: string; update: SeriesUpdate; numbers: number[] }> = []
        for (const { key, update, numbers } of rows) {
          const current = entries[key]
          if (
            !current?.notification ||
            current.sourceCode !== update.sourceCode ||
            current.vodId !== update.vodId ||
            (current.bindingKey ?? 'auto') !== (update.bindingKey ?? 'auto') ||
            current.resourceSignature !== update.resourceSignature
          )
            continue
          const requested = new Set(numbers)
          const read = new Set(
            unreadEpisodeNumbers(update).filter(
              number =>
                requested.has(number) && current.notification!.unreadEpisodes.includes(number),
            ),
          )
          if (!read.size) continue
          receipts.push({ key, update: current, numbers: [...read] })
          entries[key] = {
            ...current,
            notification: {
              ...current.notification,
              unreadEpisodes: current.notification.unreadEpisodes.filter(
                number => !read.has(number),
              ),
            },
          }
        }
        if (!receipts.length) return
        useSeriesNotificationsStore.getState().markReadMany(ownerId, receipts)
        set({ entries })
      },
      refresh: () => set(state => ({ refreshTarget: null, refreshToken: state.refreshToken + 1 })),
      refreshOne: (ownerId, key, bindingKey) =>
        set(state =>
          state.ownerId === ownerId &&
          state.activeKeys.includes(key) &&
          !state.checkingKeys.includes(key)
            ? { refreshTarget: { key, bindingKey }, refreshToken: state.refreshToken + 1 }
            : state,
        ),
    }),
    {
      name: 'xkatv-series-updates',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: state => ({ ownerId: state.ownerId, entries: state.entries }),
    },
  ),
)
