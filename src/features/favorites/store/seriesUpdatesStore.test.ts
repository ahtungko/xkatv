import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSeriesUpdatesStore } from './seriesUpdatesStore'
import { unreadEpisodeNumbers, type SeriesUpdate } from '../lib/seriesTracking'
import { useSeriesNotificationsStore } from './seriesNotificationsStore'

const result = (numbers: number[], overrides: Partial<SeriesUpdate> = {}): SeriesUpdate => ({
  attemptedAt: 1,
  checkedAt: 1,
  sourceCode: 's',
  vodId: 'v',
  resourceSignature: 'endpoint-a',
  episodes: numbers.map((number, index) => ({ number, index })),
  ...overrides,
})

describe('追更缓存账号隔离', () => {
  it('一批已读提醒只写入一次提醒缓存和一次检查缓存', () => {
    const store = useSeriesUpdatesStore.getState()
    const keys = Array.from({ length: 20 }, (_, index) => `show-${index}`)
    store.configure('alice', keys)
    for (const key of keys) {
      store.saveResult('alice', key, result([1, 2]))
      store.saveResult('alice', key, result([1, 2, 3]))
    }
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    store.markReadMany('alice', keys.map(key => ({ key, update: useSeriesUpdatesStore.getState().entries[key], numbers: [3] })))
    expect(writes.mock.calls.filter(([key]) => key === 'xkatv-series-notifications')).toHaveLength(1)
    expect(writes.mock.calls.filter(([key]) => key === 'xkatv-series-updates')).toHaveLength(1)
    for (const key of keys) expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries[key])).toEqual([])
  })

  beforeEach(() => {
    localStorage.clear()
    useSeriesNotificationsStore.setState({
      accounts: {},
      syncOwner: null,
      status: '未同步',
      error: null,
    })
    useSeriesUpdatesStore.setState({
      ownerId: null,
      entries: {},
      checking: false,
      checkingKeys: [],
      checkProgress: null,
      activeKeys: [],
      refreshToken: 0,
      refreshTarget: null,
    })
  })

  it('只接受当前账号有效追更项的重查，忽略重复或过期请求', () => {
    const store = useSeriesUpdatesStore.getState()
    store.configure('alice', ['a', 'b'])
    store.refreshOne('bob', 'a', 'auto')
    store.refreshOne('alice', 'missing', 'auto')
    expect(useSeriesUpdatesStore.getState().refreshToken).toBe(0)
    store.refreshOne('alice', 'a', 'fixed')
    expect(useSeriesUpdatesStore.getState().refreshTarget).toEqual({
      key: 'a',
      bindingKey: 'fixed',
    })
    useSeriesUpdatesStore.setState({
      checking: true,
      checkingKeys: ['a'],
      checkProgress: { total: 1, completed: 0, failed: 0, cached: 0 },
    })
    store.refreshOne('alice', 'a', 'fixed')
    expect(useSeriesUpdatesStore.getState().refreshToken).toBe(1)
    store.configure('bob', ['b'])
    expect(useSeriesUpdatesStore.getState().checkingKeys).toEqual([])
    expect(useSeriesUpdatesStore.getState().checking).toBe(false)
    expect(useSeriesUpdatesStore.getState().checkProgress).toBeNull()
    expect(useSeriesUpdatesStore.getState().refreshTarget).toBeNull()
    const persisted = JSON.parse(localStorage.getItem('xkatv-series-updates')!).state
    expect(Object.keys(persisted).sort()).toEqual(['entries', 'ownerId'])
  })

  it('切换账号清除旧结果，旧账号的迟到请求不能写入新账号', () => {
    const store = useSeriesUpdatesStore.getState()
    store.configure('alice', ['a'])
    store.saveResult('alice', 'a', { attemptedAt: 1, checkedAt: 1 })
    store.configure('bob', ['a'])
    store.saveResult('alice', 'a', { attemptedAt: 2, checkedAt: 2 })
    expect(useSeriesUpdatesStore.getState().entries).toEqual({})
  })

  it('取消追更、删除收藏或切换季数后移除旧缓存', () => {
    const store = useSeriesUpdatesStore.getState()
    store.configure('alice', ['a', 'b'])
    store.saveResult('alice', 'a', { attemptedAt: 1 })
    store.saveResult('alice', 'b', { attemptedAt: 1 })
    store.configure('alice', ['b'])
    expect(Object.keys(useSeriesUpdatesStore.getState().entries)).toEqual(['b'])
  })

  it('首次成功检查只建基准，后续新增集数累计为未读且不重复计算', () => {
    const store = useSeriesUpdatesStore.getState()
    store.configure('alice', ['a'])
    store.saveResult('alice', 'a', { attemptedAt: 1, error: 'offline' })
    store.saveResult('alice', 'a', result([1, 2]))
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([])
    store.saveResult('alice', 'a', result([1, 2, 3, 4]))
    store.saveResult('alice', 'a', result([1, 2, 3, 4]))
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([3, 4])
    expect(localStorage.getItem('xkatv-series-updates')).toContain('unreadEpisodes')
  })

  it('点击旧快照仅确认已展示集数，检查成功或失败都不会恢复已读提醒', () => {
    const store = useSeriesUpdatesStore.getState()
    store.configure('alice', ['a'])
    store.saveResult('alice', 'a', result([1, 2]))
    store.saveResult('alice', 'a', result([1, 2, 3]))
    const displayed = useSeriesUpdatesStore.getState().entries.a
    store.saveResult('alice', 'a', result([1, 2, 3, 4]))
    store.markRead('alice', 'a', displayed)
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([4])
    store.saveResult('alice', 'a', { ...displayed, attemptedAt: 2, error: 'offline' })
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([4])
    store.saveResult('alice', 'a', result([1, 2, 3, 4]))
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([4])
  })

  it('已确认的集数短暂下架再恢复，不重复提示新增', () => {
    const store = useSeriesUpdatesStore.getState()
    store.configure('alice', ['a'])
    store.saveResult('alice', 'a', result([1, 2]))
    store.saveResult('alice', 'a', result([1, 2, 3]))
    store.markRead('alice', 'a', useSeriesUpdatesStore.getState().entries.a)
    store.saveResult('alice', 'a', result([1, 2]))
    store.saveResult('alice', 'a', result([1, 2, 3, 4]))
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([4])
  })
  it('绑定模式变化清除旧资源结果，失败后不显示旧集数，成功后重新建基准', () => {
    const store = useSeriesUpdatesStore.getState()
    store.configure('alice', ['a'])
    store.saveResult('alice', 'a', result([1, 2]))
    store.saveResult('alice', 'a', result([1, 2, 3]))
    const old = useSeriesUpdatesStore.getState().entries.a
    store.saveResult('alice', 'a', {
      ...old,
      bindingKey: 'fixed',
      attemptedAt: 2,
      error: 'offline',
    })
    expect(useSeriesUpdatesStore.getState().entries.a.episodes).toBeUndefined()
    store.saveResult('alice', 'a', result([1, 2, 3, 4], { bindingKey: 'fixed' }))
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([])
    store.saveResult('alice', 'a', result([1, 2, 3, 4, 5], { bindingKey: 'fixed' }))
    store.markRead('alice', 'a', old)
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([5])
  })

  it.each([{ sourceCode: 's2' }, { vodId: 'v2' }, { resourceSignature: 'endpoint-b' }])(
    '切换资源 %j 重新建基准，旧资源的已读操作不影响新资源',
    overrides => {
      const store = useSeriesUpdatesStore.getState()
      store.configure('alice', ['a'])
      store.saveResult('alice', 'a', result([1, 2]))
      store.saveResult('alice', 'a', result([1, 2, 3]))
      const displayed = useSeriesUpdatesStore.getState().entries.a
      store.saveResult('alice', 'a', result([1, 2, 3, 4], overrides))
      expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([])
      store.saveResult('alice', 'a', result([1, 2, 3, 4, 5], overrides))
      store.markRead('alice', 'a', displayed)
      expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([5])
      store.markRead('bob', 'a', useSeriesUpdatesStore.getState().entries.a)
      expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries.a)).toEqual([5])
    },
  )
})
