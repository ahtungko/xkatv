import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoSource } from '@xkatv/cms-core'

const mocks = vi.hoisted(() => ({
  publicSources: vi.fn(),
  restrictedSources: vi.fn(),
}))

vi.mock('@/shared/config/api.config', () => ({
  getInitialVideoSources: mocks.publicSources,
  getAuthorizedNsfwVideoSources: mocks.restrictedSources,
}))

import { useApiStore } from './apiStore'

const source = (id: string, name = id): VideoSource => ({
  id,
  name,
  url: `https://${id}.example/api`,
  isEnabled: true,
})

beforeEach(() => {
  localStorage.clear()
  mocks.publicSources.mockReset().mockResolvedValue([source('env_source_0', 'Public')])
  mocks.restrictedSources.mockReset().mockResolvedValue([])
  useApiStore.setState({
    videoAPIs: [source('manual_source', 'Manual'), source('nsfw_env_0', 'Old restricted')],
    adFilteringEnabled: true,
    lastEnvSourcesCheckedDate: null,
  })
})

describe('account source access', () => {
  it('removes previously issued NSFW sources when the account has no access', async () => {
    await useApiStore.getState().initializeEnvSources()
    expect(useApiStore.getState().videoAPIs.map(item => item.id)).toEqual([
      'manual_source',
      'env_source_0',
    ])
  })

  it('adds server-authorized NSFW sources alongside public sources', async () => {
    mocks.restrictedSources.mockResolvedValueOnce([source('nsfw_env_0', 'Restricted')])
    await useApiStore.getState().initializeEnvSources()
    expect(useApiStore.getState().videoAPIs.map(item => item.id)).toEqual([
      'manual_source',
      'env_source_0',
      'nsfw_env_0',
    ])
  })

  it('clears restricted sources as soon as the authenticated account is removed', () => {
    useApiStore.getState().clearRestrictedSources()
    expect(useApiStore.getState().videoAPIs.map(item => item.id)).toEqual(['manual_source'])
  })
  it('updates existing env source URLs when upstream changes', async () => {
    useApiStore.setState({
      videoAPIs: [{ ...source('iqiyi', '爱奇艺'), url: 'https://old.iqiyi.com', isEnv: true }],
    })
    mocks.publicSources.mockResolvedValueOnce([
      { ...source('iqiyi', '爱奇艺'), url: 'https://new.iqiyi.com' },
    ])
    await useApiStore.getState().initializeEnvSources()
    const updated = useApiStore.getState().videoAPIs.find(s => s.id === 'iqiyi')
    expect(updated?.url).toBe('https://new.iqiyi.com')
  })

  it('prunes dead env sources removed upstream while preserving manual sources', async () => {
    useApiStore.setState({
      videoAPIs: [
        source('manual_source', 'Manual'),
        { ...source('dead_source', 'Dead Source'), isEnv: true },
      ],
    })
    mocks.publicSources.mockResolvedValueOnce([source('active_source', 'Active Source')])
    await useApiStore.getState().initializeEnvSources()
    const ids = useApiStore.getState().videoAPIs.map(s => s.id)
    expect(ids).toContain('manual_source')
    expect(ids).toContain('active_source')
    expect(ids).not.toContain('dead_source')
  })

  it('preserves user manual isEnabled preference across upstream source updates', async () => {
    useApiStore.setState({
      videoAPIs: [
        { ...source('iqiyi', '爱奇艺'), isEnabled: false, isEnv: true },
      ],
    })
    mocks.publicSources.mockResolvedValueOnce([
      { ...source('iqiyi', '爱奇艺'), url: 'https://new.iqiyi.com', isEnabled: true },
    ])
    await useApiStore.getState().initializeEnvSources()
    const updated = useApiStore.getState().videoAPIs.find(s => s.id === 'iqiyi')
    expect(updated?.url).toBe('https://new.iqiyi.com')
    expect(updated?.isEnabled).toBe(false)
  })
  it('skips fetching if already synced today and not forced', async () => {
    const today = new Date().toISOString().slice(0, 10)
    useApiStore.setState({
      videoAPIs: [source('existing', 'Existing')],
      lastEnvSourcesCheckedDate: today,
    })
    await useApiStore.getState().initializeEnvSources(false)
    expect(mocks.publicSources).not.toHaveBeenCalled()
  })

  it('forces fetching even if already synced today when force is true', async () => {
    const today = new Date().toISOString().slice(0, 10)
    useApiStore.setState({
      videoAPIs: [source('existing', 'Existing')],
      lastEnvSourcesCheckedDate: today,
    })
    await useApiStore.getState().initializeEnvSources(true)
    expect(mocks.publicSources).toHaveBeenCalled()
  })
})
