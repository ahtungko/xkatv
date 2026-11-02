import { useCallback, useEffect, useRef, useState } from 'react'
import { getTmdbClient, resolveTmdbApiBaseUrl } from '@/shared/lib/tmdb'
import { useSettingStore } from '@/shared/store/settingStore'
import { useAuthStore } from '@/shared/store/authStore'
import { normalizeTrackingSeasons, type TrackingSeason } from '../lib/trackingSeasons'
export type { TrackingSeason } from '../lib/trackingSeasons'

interface SeasonCacheEntry {
  expiresAt: number
  result: Promise<TrackingSeason[]>
}

const caches = new WeakMap<ReturnType<typeof getTmdbClient>, Map<string, SeasonCacheEntry>>()

async function fetchSeasons(id: number, language: string, force: boolean) {
  const client = getTmdbClient()
  let cache = caches.get(client)
  if (!cache) {
    cache = new Map()
    caches.set(client, cache)
  }
  const key = JSON.stringify([id, language, resolveTmdbApiBaseUrl()])
  const cached = cache.get(key)
  if (!force && cached && cached.expiresAt > Date.now()) return cached.result
  // 只取基础剧集资料，不附加演职员、推荐、图片等详情页数据。
  const result = client.tvShows.details(id, undefined, language).then(detail => {
    return normalizeTrackingSeasons(detail.seasons ?? [])
  })
  const entry = { expiresAt: Date.now() + 60 * 60 * 1000, result }
  cache.set(key, entry)
  if (cache.size > 100) cache.delete(cache.keys().next().value!)
  try {
    return await result
  } catch (error) {
    if (cache.get(key) === entry) cache.delete(key)
    throw error
  }
}

export function useTrackingSeasons(id: number | undefined, enabled: boolean, refreshKey?: number) {
  const language = useSettingStore(state => state.system.tmdbLanguage)
  const token = useSettingStore(state => state.system.tmdbApiToken)
  const apiBase = useSettingStore(state => state.system.tmdbApiBaseUrl)
  const ownerId = useAuthStore(state => state.account?.id)
  const key = JSON.stringify([id, language, token, apiBase, ownerId])
  const currentKey = useRef(key)
  currentKey.current = key
  const mounted = useRef(false)
  const requestId = useRef(0)
  const [state, setState] = useState<{
    key: string
    seasons: TrackingSeason[]
    loading: boolean
    error: string | null
  }>({ key, seasons: [], loading: false, error: null })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(
    async (force = false) => {
      if (!id) return undefined
      const request = ++requestId.current
      setState(previous => ({
        key,
        seasons: previous.key === key ? previous.seasons : [],
        loading: true,
        error: null,
      }))
      try {
        const seasons = await fetchSeasons(id, language, force)
        if (!mounted.current || currentKey.current !== key || requestId.current !== request)
          return undefined
        setState({
          key,
          seasons,
          loading: false,
          error: seasons.length ? null : '暂无可追更的正片季',
        })
        return seasons
      } catch {
        if (!mounted.current || currentKey.current !== key || requestId.current !== request)
          return undefined
        setState(previous => ({ ...previous, loading: false, error: '季信息加载失败，请重试' }))
        return undefined
      }
    },
    [id, language, key],
  )

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load, refreshKey])
  return { ...(state.key === key ? state : { seasons: [], loading: false, error: null }), load }
}
