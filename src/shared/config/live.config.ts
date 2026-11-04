import { getPublicEnv } from './runtimeEnv'
import type { LiveSubscription } from '@/shared/types/live'

export const DEFAULT_LIVE_SUBSCRIPTIONS: LiveSubscription[] = []

export const parseInitialLiveSubscriptions = (): LiveSubscription[] => {
  const envVal = getPublicEnv('XKA_INITIAL_LIVE_SUBSCRIPTIONS')?.trim()
  if (!envVal) return DEFAULT_LIVE_SUBSCRIPTIONS

  try {
    const parsed = JSON.parse(envVal)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item, index) => {
          if (!item || typeof item !== 'object') return null
          const url = typeof item.url === 'string' ? item.url.trim() : ''
          if (!url) return null
          return {
            id: typeof item.id === 'string' && item.id ? item.id : `env_live_${index}`,
            name: typeof item.name === 'string' && item.name ? item.name : `直播源 ${index + 1}`,
            url,
            isEnabled: item.isEnabled ?? true,
            updatedAt: item.updatedAt || new Date().toISOString(),
          } as LiveSubscription
        })
        .filter((item): item is LiveSubscription => item !== null)
    }
  } catch {
    // If not valid JSON, try newline or comma-separated URLs
    const urls = envVal
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean)

    return urls.map((url, index) => ({
      id: `env_live_${index}`,
      name: `直播源 ${index + 1}`,
      url,
      isEnabled: true,
      updatedAt: new Date().toISOString(),
    }))
  }

  return DEFAULT_LIVE_SUBSCRIPTIONS
}
