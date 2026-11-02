import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/config/project', () => ({
  PROJECT: {
    name: 'xkaTV',
    version: '2.1.0+git.abc1234',
    commit: 'abc1234',
    repository: 'https://github.com/owner/tv',
    issues: 'https://github.com/owner/tv/issues',
    updatedAt: '2026-10-22T08:00:00Z',
    builtAt: '2026-10-23T08:00:00Z',
    changes: [
      { subject: 'feat(announcement): add preview' },
      { subject: 'fix: reset maintenance time' },
    ],
  },
}))
import { useVersionStore } from './versionStore'

beforeEach(() => {
  localStorage.clear()
  useVersionStore.setState({ lastViewedVersion: '2.1.0', showUpdateModal: false })
})

describe('自动构建版本', () => {
  it('构建版本和提交说明自动进入日志，修复项单独展示', () => {
    const store = useVersionStore.getState()
    expect(store.currentVersion).toBe('2.1.0+git.abc1234')
    expect(store.getLatestUpdate()).toMatchObject({
      version: store.currentVersion,
      title: 'add preview',
      features: ['add preview'],
      fixes: ['reset maintenance time'],
    })
  })

  it('旧版本已读记录不覆盖构建信息，确认后刷新同一构建不重复提示', async () => {
    localStorage.setItem(
      'xkatv-version-store',
      JSON.stringify({ state: { lastViewedVersion: '2.1.0' }, version: 1 }),
    )
    await useVersionStore.persist.rehydrate()
    expect(useVersionStore.getState().hasNewVersion()).toBe(true)
    useVersionStore.getState().markVersionAsViewed('2.1.0+git.abc1234')
    await useVersionStore.persist.rehydrate()
    expect(useVersionStore.getState().hasNewVersion()).toBe(false)
    expect(useVersionStore.getState().currentVersion).toBe('2.1.0+git.abc1234')
  })
})
