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
      markEpisodesRead: (ownerId, key, displayedUpdate, numbers) => {
        const state = get()
        const current = state.entries[key]
        if (
          state.ownerId !== ownerId ||
          !current?.notification ||
          current.sourceCode !== displayedUpdate.sourceCode ||
          current.vodId !== displayedUpdate.vodId ||
          (current.bindingKey ?? 'auto') !== (displayedUpdate.bindingKey ?? 'auto') ||
          current.resourceSignature !== displayedUpdate.resourceSignature
        )
          return
        // 只确认快照中的提醒，保留操作前刚到达的新集。
        const requested = new Set(numbers)
        const read = new Set(
          unreadEpisodeNumbers(displayedUpdate).filter(number => requested.has(number)),
        )
        if (!read.size) return
        useSeriesNotificationsStore.getState().markRead(ownerId, key, current, [...read])
        set({
          entries: {
            ...state.entries,
            [key]: {
              ...current,
              notification: {
                ...current.notification,
                unreadEpisodes: current.notification.unreadEpisodes.filter(
                  number => !read.has(number),
                ),
              },
            },
          },
        })
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
