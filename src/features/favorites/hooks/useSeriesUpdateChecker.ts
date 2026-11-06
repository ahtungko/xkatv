import { useEffect } from 'react'
import {
  createCmsClient,
  createDirectStrategy,
  createFetchAdapter,
  createUrlPrefixProxyStrategy,
} from '@xkatv/cms-core'
import { normalizeProxyPrefix } from '@/shared/config/api.config'
import { useApiStore } from '@/shared/store/apiStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import { useFavoritesStore } from '../store/favoritesStore'
import { useSeriesUpdatesStore } from '../store/seriesUpdatesStore'
import {
  canTrackFavorite,
  trackingKey,
  trackingBindingKey,
} from '../lib/seriesTracking'
import { checkSeriesUpdates } from '../lib/checkSeriesUpdates'
import type { FavoriteItem } from '../types/favorites'

const CHECK_INTERVAL = 30 * 60 * 1000
const fingerprint = (value: string) =>
  String(
    Array.from(value).reduce(
      (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0,
      0,
    ),
  )

const emptyFavorites: FavoriteItem[] = []

export function useSeriesUpdateChecker() {
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  const ownerId = useAuthStore(state => state.account?.id)
  const favorites = useFavoritesStore(state => isPrivateMode ? emptyFavorites : state.favorites)
  const sources = useApiStore(state => state.videoAPIs)
  const network = useSettingStore(state => state.network)
  const tmdbEnabled = useSettingStore(state => state.system.tmdbEnabled)
  // 收藏状态、评分及云同步回写不应中断后台检查。
  const signature = JSON.stringify(
    favorites
      .filter(
        item =>
          item.tracking?.enabled &&
          canTrackFavorite(item) &&
          (tmdbEnabled || item.sourceType === 'cms'),
      )
      .map(item => ({
        id: item.id,
        sourceType: item.sourceType,
        media: item.media,
        tracking: {
          enabled: item.tracking?.enabled,
          seasonNumber: item.tracking?.seasonNumber,
          bindingKey: trackingBindingKey(item),
        },
      })),
  )
  const sourceSignature = JSON.stringify(sources.filter(source => source.isEnabled))
  const networkSignature = JSON.stringify(network)

  useEffect(() => {
    if (isPrivateMode) return
    if (!ownerId) return
    // 缓存只记录配置指纹，不额外保存代理地址或视频源凭据。
    const configuration = fingerprint(sourceSignature + networkSignature)
    const items = useFavoritesStore
      .getState()
      .favorites.filter(
        item =>
          item.tracking?.enabled &&
          canTrackFavorite(item) &&
          (tmdbEnabled || item.sourceType === 'cms'),
      )
    useSeriesUpdatesStore.getState().configure(ownerId, items.map(trackingKey))
    if (!items.length) return

    const controller = new AbortController()
    const adapter = createFetchAdapter()
    const config = useSettingStore.getState().network
    const client = createCmsClient({
      proxyStrategy: config.isProxyEnabled
        ? createUrlPrefixProxyStrategy(normalizeProxyPrefix(config.proxyUrl))
        : createDirectStrategy(),
      requestAdapter: {
        fetch: (url, options) => {
          controller.signal.throwIfAborted()
          return adapter.fetch(url, { ...options, signal: controller.signal })
        },
      },
    })
    // 后台检查不重试；限制单次请求时长，减少对播放与交互的影响。
    const enabledSources = useApiStore
      .getState()
      .videoAPIs.filter(source => source.isEnabled)
      .map(source => ({
        ...source,
        timeout: Math.min(source.timeout || config.defaultTimeout, 10000),
        retry: 0,
      }))
    const queue = new Map<string, FavoriteItem>()
    const running = new Set<string>()
    const outcomes = new Map<string, 'pending' | 'success' | 'failed' | 'cached'>()
    const isCurrent = (item: FavoriteItem) => {
      const current = useFavoritesStore
        .getState()
        .favorites.find(favorite => favorite.id === item.id)
      return (
        !controller.signal.aborted &&
        useAuthStore.getState().account?.id === ownerId &&
        useSettingStore.getState().system.tmdbEnabled === tmdbEnabled &&
        JSON.stringify(useApiStore.getState().videoAPIs.filter(source => source.isEnabled)) ===
          sourceSignature &&
        JSON.stringify(useSettingStore.getState().network) === networkSignature &&
        !!current?.tracking?.enabled &&
        trackingKey(current) === trackingKey(item) &&
        trackingBindingKey(current) === trackingBindingKey(item)
      )
    }
    const syncChecking = () => {
      if (!controller.signal.aborted && useSeriesUpdatesStore.getState().ownerId === ownerId) {
        const checkingKeys = [...running, ...queue.keys()]
        const states = [...outcomes.values()]
        const checkProgress = states.length
          ? {
              total: states.filter(state => state !== 'cached').length,
              completed: states.filter(state => state === 'success' || state === 'failed').length,
              failed: states.filter(state => state === 'failed').length,
              cached: states.filter(state => state === 'cached').length,
            }
          : null
        useSeriesUpdatesStore.setState({
          checkingKeys,
          checking: checkingKeys.length > 0,
          checkProgress,
        })
      }
    }
    const runItem = async (item: FavoriteItem) => {
      const key = trackingKey(item)
      const bindingKey = trackingBindingKey(item)
      const previous = useSeriesUpdatesStore.getState().entries[key]
      try {
        const result = await checkSeriesUpdates(
          item,
          client,
          enabledSources,
          useViewingHistoryStore.getState().viewingHistory,
          controller.signal,
        )
        const source = enabledSources.find(source => source.id === result.sourceCode)
        const resourceSignature = fingerprint(JSON.stringify([source?.url, source?.detailUrl]))
        if (isCurrent(item)) {
          useSeriesUpdatesStore
            .getState()
            .saveResult(ownerId, key, { ...result, configuration, resourceSignature, bindingKey })
          return 'success' as const
        }
      } catch (error) {
        if (!isCurrent(item)) return
        useSeriesUpdatesStore.getState().saveResult(ownerId, key, {
          ...previous,
          attemptedAt: Date.now(),
          bindingKey,
          error: error instanceof Error ? error.message : '检查失败，请稍后刷新',
        })
        return 'failed' as const
      }
    }
    function pump() {
      while (!controller.signal.aborted && running.size < 2 && queue.size) {
        const [key, item] = queue.entries().next().value!
        queue.delete(key)
        if (!isCurrent(item)) {
          outcomes.delete(key)
          continue
        }
        running.add(key)
        void runItem(item)
          .then(outcome => {
            if (outcome) outcomes.set(key, outcome)
            else outcomes.delete(key)
          })
          .finally(() => {
            running.delete(key)
            pump()
          })
      }
      syncChecking()
    }
    const enqueue = (requested: FavoriteItem[], force: boolean) => {
      const pending = new Map<string, FavoriteItem>()
      const cached = new Set<string>()
      for (const item of requested) {
        const key = trackingKey(item)
        if (!isCurrent(item) || running.has(key) || queue.has(key)) continue
        const previous = useSeriesUpdatesStore.getState().entries[key]
        // 手动检查绕过缓存；只重试目标剧集，不重新请求其他已缓存的剧集。
        if (
          !force &&
          previous &&
          !previous.error &&
          previous.configuration === configuration &&
          (previous.bindingKey ?? 'auto') === trackingBindingKey(item) &&
          enabledSources.some(source => source.id === previous.sourceCode) &&
          Date.now() - previous.attemptedAt < CHECK_INTERVAL
        ) {
          cached.add(key)
          continue
        }
        pending.set(key, item)
      }
      // 一轮结束后，手动检查开启新一轮；纯缓存命中不覆盖刚完成的检查摘要。
      if (!running.size && !queue.size) {
        if (!pending.size && outcomes.size) return
        if (pending.size) outcomes.clear()
      }
      for (const key of cached) if (!outcomes.has(key)) outcomes.set(key, 'cached')
      for (const [key, item] of pending) {
        // 同轮重试替换该剧的旧结果，避免把一部剧重复计入分母。
        outcomes.set(key, 'pending')
        queue.set(key, item)
      }
      pump()
    }
    const unsubscribe = useSeriesUpdatesStore.subscribe((state, previous) => {
      if (state.refreshToken === previous.refreshToken || state.ownerId !== ownerId) return
      const target = state.refreshTarget
      if (!target) enqueue(items, true)
      else {
        const item = items.find(
          item =>
            trackingKey(item) === target.key && trackingBindingKey(item) === target.bindingKey,
        )
        if (item) enqueue([item], true)
      }
    })
    // 合并初始化/云同步触发的变更，也避免 StrictMode 重复发起请求。
    const timer = window.setTimeout(() => enqueue(items, false), 300)
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
      controller.abort()
      queue.clear()
      client.destroy()
      if (useSeriesUpdatesStore.getState().ownerId === ownerId)
        useSeriesUpdatesStore.setState({ checking: false, checkingKeys: [], checkProgress: null })
    }
  }, [ownerId, signature, sourceSignature, networkSignature, tmdbEnabled, isPrivateMode])
}
