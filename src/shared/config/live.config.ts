import { getPublicEnv } from './runtimeEnv'
import type { LiveSubscription } from '@/shared/types/live'
import { INITIAL_CONFIG } from './initialConfig'

export const DEFAULT_LIVE_SUBSCRIPTIONS: LiveSubscription[] = []

export const parseInitialLiveSubscriptions = (): LiveSubscription[] => {
  const envVal = getPublicEnv('XKA_INITIAL_LIVE_SUBSCRIPTIONS')?.trim()
  const initialConfigSubs = INITIAL_CONFIG?.liveSubscriptions

  if (!envVal && (!initialConfigSubs || initialConfigSubs.length === 0)) {
    return DEFAULT_LIVE_SUBSCRIPTIONS
  }

  const results: LiveSubscription[] = []

  if (Array.isArray(initialConfigSubs)) {
    initialConfigSubs.forEach((item, index) => {
      if (item && typeof item === 'object') {
        const url = typeof item.url === 'string' ? item.url.trim() : ''
        if (!url) return
        results.push({
          id: item.id || `config_live_${index}`,
          name: item.name || `直播源 ${index + 1}`,
          url,
          isEnabled: item.isEnabled ?? true,
          updatedAt: item.updatedAt
            ? new Date(item.updatedAt).toISOString()
            : new Date().toISOString(),
        })
      }
    })
  }

  if (envVal) {
    try {
      const parsed = JSON.parse(envVal)
      if (Array.isArray(parsed)) {
        parsed.forEach((item, index) => {
          if (!item || typeof item !== 'object') return
          const url = typeof item.url === 'string' ? item.url.trim() : ''
          if (!url) return
          results.push({
            id: typeof item.id === 'string' && item.id ? item.id : `env_live_${index}`,
            name: typeof item.name === 'string' && item.name ? item.name : `直播源 ${index + 1}`,
            url,
            isEnabled: item.isEnabled ?? true,
            updatedAt: item.updatedAt || new Date().toISOString(),
          })
        })
      }
    } catch {
      // If not valid JSON, try newline or comma-separated URLs
      const urls = envVal
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean)

      urls.forEach((url, index) => {
        results.push({
          id: `env_live_${index}`,
          name: `直播源 ${index + 1}`,
          url,
          isEnabled: true,
          updatedAt: new Date().toISOString(),
        })
      })
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>()
  return results.filter(sub => {
    if (seen.has(sub.url)) return false
    seen.add(sub.url)
    return true
  })
}
