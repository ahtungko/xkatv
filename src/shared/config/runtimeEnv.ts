export const PUBLIC_ENV_KEYS = [
  'XKA_SUPABASE_URL',
  'XKA_SUPABASE_ANON_KEY',
  'XKA_SUPABASE_PUBLISHABLE_KEY',
  'XKA_INITIAL_VIDEO_SOURCES',
  'XKA_TMDB_API_TOKEN',
  'XKA_TMDB_API_BASE_URL',
  'XKA_TMDB_IMAGE_BASE_URL',
  'XKA_DISABLE_ANALYTICS',
  'XKA_INITIAL_CONFIG',
  'XKA_INITIAL_LIVE_SUBSCRIPTIONS',
  'XKA_LIVE_PROXY_URL',
  'XKA_LIVE_ENABLED',
  'XKA_TV_CAST_ENABLED',
] as const

export const LEGACY_PUBLIC_ENV_KEYS = [] as const

export type PrimaryPublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number]
export type LegacyPublicEnvKey = never
export type PublicEnvKey = PrimaryPublicEnvKey
export type RuntimeConfig = Partial<Record<PublicEnvKey, string>>

type RuntimeConfigGlobal = typeof globalThis & {
  __XKA_RUNTIME_CONFIG__?: RuntimeConfig
}

function getBuildTimeEnv(key: PublicEnvKey): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>
  return env[key]
}

export function getRuntimeConfig(): RuntimeConfig {
  const g = globalThis as RuntimeConfigGlobal
  return g.__XKA_RUNTIME_CONFIG__ ?? {}
}

/** Docker 运行时配置优先，其他部署回退到 Vite 构建时环境变量。 */
export function getPublicEnv(key: PublicEnvKey): string | undefined {
  const runtimeConfig = getRuntimeConfig()

  if (Object.prototype.hasOwnProperty.call(runtimeConfig, key)) {
    const v = runtimeConfig[key]
    return typeof v === 'string' ? v : undefined
  }

  return getBuildTimeEnv(key)
}

function hashConfigValue(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** 标识会初始化本地视频源和订阅的配置；环境变量变化后触发一次重新初始化。 */
export function getInitialContentConfigId(schemaVersion = '3'): string {
  const initialConfig = getPublicEnv('XKA_INITIAL_CONFIG')?.trim() ?? ''
  const initialSources = getPublicEnv('XKA_INITIAL_VIDEO_SOURCES')?.trim() ?? ''
  const initialLive = getPublicEnv('XKA_INITIAL_LIVE_SUBSCRIPTIONS')?.trim() ?? ''
  return `${schemaVersion}:${hashConfigValue(`${initialConfig}\u0000${initialSources}\u0000${initialLive}`)}`
}
