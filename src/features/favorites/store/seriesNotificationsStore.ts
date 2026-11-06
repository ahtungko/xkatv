import { create } from 'zustand'
import { persist, type PersistStorage } from 'zustand/middleware'
import type { SeriesUpdate } from '../lib/seriesTracking'
import {
  mergeNotificationAccounts,
  notificationIdentity,
  notificationView,
  parseNotificationAccounts,
  unionEpisodes,
  type LocalSeriesNotification,
  type NotificationAccounts,
  type RemoteSeriesNotification,
} from '../lib/seriesNotificationSync'

interface NotificationState {
  accounts: NotificationAccounts
  syncOwner: string | null
  status: string
  error: string | null
  observe: (owner: string, key: string, update: SeriesUpdate) => SeriesUpdate['notification']
  markRead: (owner: string, key: string, update: SeriesUpdate, numbers: number[]) => void
  markReadMany: (
    owner: string,
    rows: Array<{ key: string; update: SeriesUpdate; numbers: number[] }>,
  ) => void
  applyRemote: (owner: string, rows: RemoteSeriesNotification[]) => void
}

type SavedState = Pick<NotificationState, 'accounts'>
function readSavedAccounts(text: string | null): NotificationAccounts {
  if (!text) return {}
  try {
    const value = JSON.parse(text)
    return parseNotificationAccounts(value?.state?.accounts ?? {})
  } catch {
    return {}
  }
}

const storage: PersistStorage<SavedState> = {
  getItem: name => {
    const text = localStorage.getItem(name)
    if (!text) return null
    return {
      state: { accounts: readSavedAccounts(text) },
      version: 0,
    }
  },
  setItem: (name, value) => {
    const text = localStorage.getItem(name)
    const disk = readSavedAccounts(text)
    // Union receipts before writing so another tab's unsent reads cannot be lost.
    localStorage.setItem(
      name,
      JSON.stringify({
        ...value,
        state: {
          accounts: mergeNotificationAccounts(
            disk,
            parseNotificationAccounts(value.state.accounts),
          ),
        },
      }),
    )
  },
  removeItem: name => localStorage.removeItem(name),
}

export const useSeriesNotificationsStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      accounts: {},
      syncOwner: null,
      status: '未同步',
      error: null,
      observe: (owner, key, update) => {
        const identity = notificationIdentity(key, update)
        if (!identity || update.error) return update.notification
        const existing = get().accounts[owner]?.[identity.resourceKey]
        const known = unionEpisodes(
          update.notification?.knownEpisodes ?? [],
          update.episodes!.map(episode => episode.number),
          existing?.knownEpisodes ?? [],
        )
        const unread = new Set(update.notification?.unreadEpisodes ?? [])
        const row: LocalSeriesNotification = existing
          ? { ...existing, knownEpisodes: known }
          : {
              ...identity,
              knownEpisodes: known,
              baselineEpisodes: known.filter(number => !unread.has(number)),
              readEpisodes: [],
              syncedKnownEpisodes: [],
              syncedReadEpisodes: [],
            }
        if (JSON.stringify(row) !== JSON.stringify(existing))
          set(state => ({
            accounts: {
              ...state.accounts,
              [owner]: { ...state.accounts[owner], [row.resourceKey]: row },
            },
          }))
        return notificationView(row)
      },
      markRead: (owner, key, update, numbers) => {
        get().markReadMany(owner, [{ key, update, numbers }])
      },
      markReadMany: (owner, rows) => {
        const state = get()
        const records = { ...state.accounts[owner] }
        let changed = false
        for (const { key, update, numbers } of rows) {
          const identity = notificationIdentity(key, update)
          if (!identity) continue
          const existing = records[identity.resourceKey]
          const knownEpisodes = unionEpisodes(
            existing?.knownEpisodes ?? [],
            update.notification?.knownEpisodes ?? [],
            update.episodes!.map(ep => ep.number),
          )
          const unread = new Set(update.notification?.unreadEpisodes ?? [])
          const current: LocalSeriesNotification = existing ?? {
            ...identity,
            knownEpisodes,
            baselineEpisodes: knownEpisodes.filter(number => !unread.has(number)),
            readEpisodes: [],
            syncedKnownEpisodes: [],
            syncedReadEpisodes: [],
          }
          const readEpisodes = unionEpisodes(
            current.readEpisodes,
            numbers.filter(number => knownEpisodes.includes(number)),
          )
          if (
            !existing ||
            knownEpisodes.length !== current.knownEpisodes.length ||
            readEpisodes.length !== current.readEpisodes.length
          ) {
            records[identity.resourceKey] = { ...current, knownEpisodes, readEpisodes }
            changed = true
          }
        }
        if (changed) set({ accounts: { ...state.accounts, [owner]: records } })
      },
      applyRemote: (owner, rows) =>
        set(state => {
          const records = { ...state.accounts[owner] }
          for (const remote of rows) {
            const local = records[remote.resourceKey]
            records[remote.resourceKey] = {
              ...remote,
              knownEpisodes: unionEpisodes(local?.knownEpisodes ?? [], remote.knownEpisodes),
              readEpisodes: unionEpisodes(local?.readEpisodes ?? [], remote.readEpisodes),
              baselineEpisodes: local?.baselineEpisodes ?? [],
              syncedKnownEpisodes: unionEpisodes(
                local?.syncedKnownEpisodes ?? [],
                remote.knownEpisodes,
              ),
              syncedReadEpisodes: unionEpisodes(
                local?.syncedReadEpisodes ?? [],
                remote.readEpisodes,
              ),
            }
          }
          if (JSON.stringify(records) === JSON.stringify(state.accounts[owner] ?? {})) return state
          return { accounts: { ...state.accounts, [owner]: records } }
        }),
    }),
    {
      name: 'xkatv-series-notifications',
      storage,
      partialize: state => ({ accounts: state.accounts }),
      merge: (saved, current) => ({
        ...current,
        accounts: mergeNotificationAccounts(
          current.accounts,
          parseNotificationAccounts((saved as SavedState).accounts),
        ),
      }),
    },
  ),
)

export function syncedNotificationView(owner: string, key: string, update: SeriesUpdate) {
  const identity = notificationIdentity(key, update)
  if (!identity) return update.notification
  const row = useSeriesNotificationsStore.getState().accounts[owner]?.[identity.resourceKey]
  return row ? notificationView(row) : update.notification
}
