import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LiveChannel, LiveSubscription } from '@/shared/types/live'
import { parseInitialLiveSubscriptions } from '@/shared/config/live.config'
import { parseM3uPlaylist } from '@/features/live/lib/m3uParser'
import { buildProxyRequestUrl } from '@/shared/config/api.config'
import { useSettingStore } from '@/shared/store/settingStore'

interface LiveState {
  subscriptions: LiveSubscription[]
  cachedChannels: LiveChannel[]
  activeChannel: LiveChannel | null
  selectedCategory: string
  searchKeyword: string
  isLoading: boolean
  error: string | null

  // Actions
  setSubscriptions: (subscriptions: LiveSubscription[]) => void
  addSubscription: (subscription: Omit<LiveSubscription, 'id'>) => Promise<void>
  updateSubscription: (id: string, updates: Partial<LiveSubscription>) => void
  deleteSubscription: (id: string) => void
  refreshSubscription: (id: string) => Promise<void>
  refreshAllSubscriptions: () => Promise<void>
  setActiveChannel: (channel: LiveChannel | null) => void
  setSelectedCategory: (category: string) => void
  setSearchKeyword: (keyword: string) => void
}

function getActiveChannelsFromSubs(subscriptions: LiveSubscription[]): LiveChannel[] {
  return subscriptions
    .filter(s => s.isEnabled)
    .flatMap(s =>
      (s.channels || []).map(c => ({
        ...c,
        id: c.id.startsWith(`${s.id}_`) ? c.id : `${s.id}_${c.id}`,
        subscriptionId: s.id,
      })),
    )
}

function getLiveProxyUrl(): string {
  const { network } = useSettingStore.getState()
  return network.liveProxyUrl?.trim() || network.proxyUrl
}

async function fetchM3uContent(url: string, proxyUrl?: string): Promise<string> {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const isHttpTarget = url.startsWith('http://')

  if (isHttps && isHttpTarget) {
    const proxiedUrl = buildProxyRequestUrl(url, proxyUrl)
    const res = await fetch(proxiedUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    return res.text()
  }

  try {
    const res = await fetch(url)
    if (res.ok) return await res.text()
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  } catch {
    const proxiedUrl = buildProxyRequestUrl(url, proxyUrl)
    const res = await fetch(proxiedUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    return res.text()
  }
}

export const useLiveStore = create<LiveState>()(
  persist(
    (set, get) => ({
      subscriptions: parseInitialLiveSubscriptions(),
      cachedChannels: [],
      activeChannel: null,
      selectedCategory: 'all',
      searchKeyword: '',
      isLoading: false,
      error: null,

      setSubscriptions: subscriptions => {
        set({
          subscriptions,
          cachedChannels: getActiveChannelsFromSubs(subscriptions),
        })
      },

      addSubscription: async subData => {
        const id = `live_sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        const newSub: LiveSubscription = {
          id,
          ...subData,
          channels: [],
          channelCount: 0,
          updatedAt: new Date().toISOString(),
        }

        set(state => ({
          subscriptions: [...state.subscriptions, newSub],
          isLoading: true,
          error: null,
        }))

        try {
          const text = await fetchM3uContent(newSub.url, getLiveProxyUrl())
          const channels = parseM3uPlaylist(text).map(c => ({
            ...c,
            id: `${id}_${c.id}`,
            subscriptionId: id,
          }))

          set(state => {
            const updatedSubs = state.subscriptions.map(s =>
              s.id === id
                ? {
                    ...s,
                    channels,
                    channelCount: channels.length,
                    updatedAt: new Date().toISOString(),
                  }
                : s,
            )
            const newCached = getActiveChannelsFromSubs(updatedSubs)
            return {
              subscriptions: updatedSubs,
              cachedChannels: newCached,
              isLoading: false,
            }
          })
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : '获取直播源失败',
          })
          throw err
        }
      },

      updateSubscription: (id, updates) => {
        set(state => {
          const updatedSubs = state.subscriptions.map(s => (s.id === id ? { ...s, ...updates } : s))
          const newCached = getActiveChannelsFromSubs(updatedSubs)
          const shouldClearActive =
            state.activeChannel &&
            (updates.isEnabled === false || updates.isEnabled !== undefined) &&
            !newCached.some(c => c.id === state.activeChannel?.id)

          return {
            subscriptions: updatedSubs,
            cachedChannels: newCached,
            activeChannel: shouldClearActive ? newCached[0] || null : state.activeChannel,
          }
        })
      },

      deleteSubscription: id => {
        set(state => {
          const updatedSubs = state.subscriptions.filter(s => s.id !== id)
          const newCached = getActiveChannelsFromSubs(updatedSubs)
          const shouldClearActive =
            state.activeChannel && !newCached.some(c => c.id === state.activeChannel?.id)

          return {
            subscriptions: updatedSubs,
            cachedChannels: newCached,
            activeChannel: shouldClearActive ? newCached[0] || null : state.activeChannel,
          }
        })
      },

      refreshSubscription: async id => {
        const sub = get().subscriptions.find(s => s.id === id)
        if (!sub) return

        set({ isLoading: true, error: null })
        try {
          const text = await fetchM3uContent(sub.url, getLiveProxyUrl())
          const channels = parseM3uPlaylist(text).map(c => ({
            ...c,
            id: `${id}_${c.id}`,
            subscriptionId: id,
          }))

          set(state => {
            const updatedSubs = state.subscriptions.map(s =>
              s.id === id
                ? {
                    ...s,
                    channels,
                    channelCount: channels.length,
                    updatedAt: new Date().toISOString(),
                  }
                : s,
            )
            const newCached = getActiveChannelsFromSubs(updatedSubs)
            const shouldResetActive =
              state.activeChannel && !newCached.some(c => c.id === state.activeChannel?.id)

            return {
              subscriptions: updatedSubs,
              cachedChannels: newCached,
              activeChannel: shouldResetActive ? newCached[0] || null : state.activeChannel,
              isLoading: false,
            }
          })
        } catch (err) {
          // 保留现有频道缓存不被清空
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : '刷新直播源失败',
          })
          throw err
        }
      },

      refreshAllSubscriptions: async () => {
        const activeSubs = get().subscriptions.filter(s => s.isEnabled)
        if (activeSubs.length === 0) {
          set({ cachedChannels: [], activeChannel: null })
          return
        }

        set({ isLoading: true, error: null })
        const liveProxy = getLiveProxyUrl()

        const fetchedMap = new Map<
          string,
          { channels: LiveChannel[]; channelCount: number; updatedAt: string }
        >()
        let failureCount = 0

        for (const sub of activeSubs) {
          try {
            const text = await fetchM3uContent(sub.url, liveProxy)
            const channels = parseM3uPlaylist(text).map(c => ({
              ...c,
              id: `${sub.id}_${c.id}`,
              subscriptionId: sub.id,
            }))
            fetchedMap.set(sub.id, {
              channels,
              channelCount: channels.length,
              updatedAt: new Date().toISOString(),
            })
          } catch (e) {
            failureCount++
            console.warn(`[LiveStore] 订阅「${sub.name}」加载失败，保留现有频道缓存:`, e)
          }
        }

        // 基于 commit 时的最新状态进行安全合并，避免覆盖刷新期间并发的用户增删改操作
        set(state => {
          const latestSubs = state.subscriptions.map(s => {
            const fetched = fetchedMap.get(s.id)
            if (fetched) {
              return {
                ...s,
                channels: fetched.channels,
                channelCount: fetched.channelCount,
                updatedAt: fetched.updatedAt,
              }
            }
            return s
          })

          const newCached = getActiveChannelsFromSubs(latestSubs)
          const shouldResetActive =
            state.activeChannel && !newCached.some(c => c.id === state.activeChannel?.id)

          return {
            subscriptions: latestSubs,
            cachedChannels: newCached,
            activeChannel: shouldResetActive ? newCached[0] || null : state.activeChannel,
            isLoading: false,
          }
        })

        if (failureCount === activeSubs.length) {
          throw new Error('所有已启用的直播源刷新失败，已保留原缓存频道')
        } else if (failureCount > 0) {
          throw new Error(`${failureCount} 个直播源刷新失败，已保留原缓存频道`)
        }
      },

      setActiveChannel: channel => {
        // In-memory state only - ZERO watch history or viewing tracking!
        set({ activeChannel: channel })
      },

      setSelectedCategory: category => {
        set({ selectedCategory: category })
      },

      setSearchKeyword: keyword => {
        set({ searchKeyword: keyword })
      },
    }),
    {
      name: 'xka-live-store',
      partialize: state => ({
        subscriptions: state.subscriptions,
        cachedChannels: state.cachedChannels,
      }),
    },
  ),
)
