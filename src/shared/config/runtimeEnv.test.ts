import { afterEach, describe, expect, it } from 'vitest'
import { getInitialContentConfigId, getPublicEnv, type RuntimeConfig } from './runtimeEnv'

type RuntimeConfigGlobal = typeof globalThis & {
  __XKA_RUNTIME_CONFIG__?: RuntimeConfig
}

const runtimeGlobal = globalThis as RuntimeConfigGlobal
const originalRuntimeConfig = runtimeGlobal.__XKA_RUNTIME_CONFIG__
const originalBuildTimePassword = import.meta.env.XKA_SUPABASE_URL

describe('getPublicEnv', () => {
  afterEach(() => {
    runtimeGlobal.__XKA_RUNTIME_CONFIG__ = originalRuntimeConfig
    import.meta.env.XKA_SUPABASE_URL = originalBuildTimePassword
  })

  it('Docker 运行时配置优先于构建时配置', () => {
    runtimeGlobal.__XKA_RUNTIME_CONFIG__ = {
      XKA_SUPABASE_URL: 'runtime-password',
    }

    expect(getPublicEnv('XKA_SUPABASE_URL')).toBe('runtime-password')
  })

  it('显式空值可以清除构建时配置', () => {
    runtimeGlobal.__XKA_RUNTIME_CONFIG__ = {
      XKA_TMDB_API_TOKEN: '',
    }

    expect(getPublicEnv('XKA_TMDB_API_TOKEN')).toBe('')
  })

  it('没有 Docker 运行时值时回退到 Vite 构建时配置', () => {
    runtimeGlobal.__XKA_RUNTIME_CONFIG__ = {}
    import.meta.env.XKA_SUPABASE_URL = 'build-time-password'

    expect(getPublicEnv('XKA_SUPABASE_URL')).toBe('build-time-password')
  })

  it('初始内容环境变量变化时生成不同配置标识', () => {
    runtimeGlobal.__XKA_RUNTIME_CONFIG__ = {
      XKA_INITIAL_VIDEO_SOURCES: '[{"name":"源一"}]',
    }
    const firstId = getInitialContentConfigId()

    runtimeGlobal.__XKA_RUNTIME_CONFIG__ = {
      XKA_INITIAL_VIDEO_SOURCES: '[{"name":"源二"}]',
    }

    expect(getInitialContentConfigId()).not.toBe(firstId)
  })

  it('初始直播源环境变量变化时生成不同配置标识', () => {
    runtimeGlobal.__XKA_RUNTIME_CONFIG__ = {
      XKA_INITIAL_LIVE_SUBSCRIPTIONS: '[{"name":"直播一"}]',
    }
    const firstId = getInitialContentConfigId()

    runtimeGlobal.__XKA_RUNTIME_CONFIG__ = {
      XKA_INITIAL_LIVE_SUBSCRIPTIONS: '[{"name":"直播二"}]',
    }

    expect(getInitialContentConfigId()).not.toBe(firstId)
  })
})
