import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { useAuthStore } from '@/shared/store/authStore'
import { useSeriesUpdatesStore } from '@/features/favorites/store/seriesUpdatesStore'
import { useSeriesNotificationsStore } from '@/features/favorites/store/seriesNotificationsStore'
import {
  notificationIdentity,
  notificationNeedsSync,
  type RemoteSeriesNotification,
} from '@/features/favorites/lib/seriesNotificationSync'
import { unreadEpisodeNumbers, type SeriesUpdate } from '@/features/favorites/lib/seriesTracking'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./client', () => ({
  syncClient: {
    rpc: (name: string, args: unknown) => ({
      setHeader: (_name: string, authorization: string) => mocks.rpc(name, args, authorization),
    }),
  },
}))
import { startSeriesNotificationSync, syncSeriesNotificationsNow } from './seriesNotifications'

const key = 'favorite::1'
const update = (numbers: number[]): SeriesUpdate => ({
  checkedAt: 1,
  attemptedAt: 1,
  sourceCode: 's',
  vodId: 'v',
  resourceSignature: 'hash',
  episodes: numbers.map((number, index) => ({ index, number })),
})
const resource = notificationIdentity(key, update([1]))!
const remote = (knownEpisodes: number[], readEpisodes: number[]): RemoteSeriesNotification => ({
  ...resource,
  knownEpisodes,
  readEpisodes,
})
function login(id: string) {
  useAuthStore.setState({
    session: { access_token: `token-${id}`, user: { id } } as Session,
    account: {
      id,
      username: id,
      role: 'user',
      enabled: true,
      allow_nsfw: false,
      devices: [],
      created_at: '2026-10-19',
    },
  })
}
const local = () => useSeriesNotificationsStore.getState().accounts.alice[resource.resourceKey]
let stop: () => void
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useSeriesNotificationsStore.setState({
    accounts: {},
    syncOwner: null,
    status: '未同步',
    error: null,
  })
  useSeriesUpdatesStore.setState({
    ownerId: 'alice',
    entries: {},
    activeKeys: [key],
    checkingKeys: [],
    refreshToken: 0,
    refreshTarget: null,
  })
  login('alice')
  mocks.rpc.mockReset().mockResolvedValue({ data: [remote([1, 2], [1, 2])], error: null })
  stop = startSeriesNotificationSync()
})
afterEach(() => {
  stop()
  vi.useRealTimers()
})

describe('提醒云同步生命周期', () => {
  it('旧追更结果中的数字ID和绑定键转换后再上传，不再让登录初始化抛错', async () => {
    const numeric = {
      ...update([1, 2, 3]),
      vodId: 83519,
      bindingKey: JSON.stringify(['s', 83519]),
      notification: { knownEpisodes: [1, 2, 3], unreadEpisodes: [3] },
    } as unknown as SeriesUpdate
    useSeriesUpdatesStore.setState({ entries: { [key]: numeric } })
    mocks.rpc.mockImplementation((_name, args) =>
      Promise.resolve({
        data: args.p_changes.map(
          (row: RemoteSeriesNotification & { baselineEpisodes: number[] }) => ({
            ...row,
            readEpisodes: row.baselineEpisodes,
          }),
        ),
        error: null,
      }),
    )
    await syncSeriesNotificationsNow()
    const payload = mocks.rpc.mock.calls[0][1].p_changes[0]
    expect(payload.vodId).toBe('83519')
    expect(JSON.parse(payload.bindingKey)).toEqual(['s', '83519'])
    expect(JSON.parse(payload.resourceKey)[3]).toBe('83519')
    expect(useSeriesNotificationsStore.getState().status).toBe('提醒已同步')
    expect(useSeriesUpdatesStore.getState().entries[key].notification?.unreadEpisodes).toEqual([3])
  })

  it('超过25个资源时分批同步，不遗漏队列中的其他季或资源', async () => {
    useSeriesUpdatesStore.setState({
      activeKeys: Array.from({ length: 27 }, (_, index) => `favorite-${index}::1`),
    })
    for (let index = 0; index < 27; index++)
      useSeriesUpdatesStore.getState().saveResult('alice', `favorite-${index}::1`, update([1, 2]))
    mocks.rpc.mockImplementation((_name, args) =>
      Promise.resolve({
        data: args.p_changes.map(
          (row: RemoteSeriesNotification & { baselineEpisodes: number[] }) => ({
            ...row,
            readEpisodes: row.baselineEpisodes,
          }),
        ),
        error: null,
      }),
    )
    await syncSeriesNotificationsNow()
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.rpc.mock.calls.map(call => call[1].p_resource_keys.length)).toEqual([25, 2])
    expect(
      Object.values(useSeriesNotificationsStore.getState().accounts.alice).every(
        row => !notificationNeedsSync(row),
      ),
    ).toBe(true)
  })

  it('迁移已有缓存、固定请求身份，仅上传集数和资源标识', async () => {
    // Cached results from the older frontend must sync even if no network check runs.
    useSeriesUpdatesStore.setState({
      entries: {
        [key]: { ...update([1, 2]), notification: { knownEpisodes: [1, 2], unreadEpisodes: [] } },
      },
    })
    await syncSeriesNotificationsNow()
    expect(mocks.rpc).toHaveBeenCalledWith(
      'sync_series_notifications',
      {
        p_resource_keys: [resource.resourceKey],
        p_changes: [
          { ...resource, knownEpisodes: [1, 2], baselineEpisodes: [1, 2], readEpisodes: [] },
        ],
      },
      'Bearer token-alice',
    )
    expect(notificationNeedsSync(local())).toBe(false)
    expect(useSeriesNotificationsStore.getState().status).toBe('提醒已同步')
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('https://')
  })

  it('云端未读更新本机提醒；列表落后时只刷新对应剧集，已读同步立即消除提醒', async () => {
    useSeriesUpdatesStore.getState().saveResult('alice', key, update([1, 2]))
    mocks.rpc.mockResolvedValueOnce({ data: [remote([1, 2, 3, 4], [1, 2])], error: null })
    await syncSeriesNotificationsNow()
    expect(useSeriesUpdatesStore.getState().refreshTarget).toEqual({ key, bindingKey: 'auto' })
    expect(useSeriesUpdatesStore.getState().entries[key].notification?.unreadEpisodes).toEqual([
      3, 4,
    ])
    useSeriesUpdatesStore.getState().saveResult('alice', key, update([1, 2, 3, 4]))
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries[key])).toEqual([3, 4])
    mocks.rpc.mockResolvedValueOnce({ data: [remote([1, 2, 3, 4], [1, 2, 3, 4])], error: null })
    await syncSeriesNotificationsNow()
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries[key])).toEqual([])
    expect(useSeriesUpdatesStore.getState().refreshToken).toBe(1)
  })

  it('上传期间的新已读和新集不被旧响应吞掉，下次继续上传', async () => {
    useSeriesUpdatesStore.getState().saveResult('alice', key, update([1, 2]))
    useSeriesUpdatesStore.getState().saveResult('alice', key, update([1, 2, 3]))
    let finish!: (value: unknown) => void
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    const syncing = syncSeriesNotificationsNow()
    await vi.advanceTimersByTimeAsync(0)
    const displayed = useSeriesUpdatesStore.getState().entries[key]
    useSeriesUpdatesStore.getState().saveResult('alice', key, update([1, 2, 3, 4]))
    useSeriesUpdatesStore.getState().markRead('alice', key, displayed)
    finish({ data: [remote([1, 2, 3], [1, 2])], error: null })
    await syncing
    expect(notificationNeedsSync(local())).toBe(true)
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries[key])).toEqual([4])
    expect(useSeriesNotificationsStore.getState().status).toBe('有待同步的提醒')
    mocks.rpc.mockResolvedValueOnce({ data: [remote([1, 2, 3, 4], [1, 2, 3])], error: null })
    await syncSeriesNotificationsNow()
    const payload = mocks.rpc.mock.calls[mocks.rpc.mock.calls.length - 1][1].p_changes[0]
    expect(payload.readEpisodes).toEqual([3])
    expect(payload.knownEpisodes).toEqual([1, 2, 3, 4])
    expect(notificationNeedsSync(local())).toBe(false)
  })

  it('离线或上传失败保留待同步已读，重新加载并恢复网络后继续', async () => {
    useSeriesUpdatesStore.getState().saveResult('alice', key, update([1, 2]))
    useSeriesUpdatesStore.getState().saveResult('alice', key, update([1, 2, 3]))
    useSeriesUpdatesStore
      .getState()
      .markRead('alice', key, useSeriesUpdatesStore.getState().entries[key])
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await syncSeriesNotificationsNow()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(notificationNeedsSync(local())).toBe(true)
    online.mockReturnValue(true)
    mocks.rpc.mockRejectedValueOnce(new Error('offline'))
    await syncSeriesNotificationsNow()
    expect(notificationNeedsSync(local())).toBe(true)
    useSeriesNotificationsStore.setState({ accounts: {} })
    mocks.rpc.mockResolvedValueOnce({ data: [remote([1, 2, 3], [1, 2, 3])], error: null })
    await syncSeriesNotificationsNow()
    expect(notificationNeedsSync(local())).toBe(false)
    expect(unreadEpisodeNumbers(useSeriesUpdatesStore.getState().entries[key])).toEqual([])
  })

  it('切账号后忽略旧请求，旧账号收据继续保存在自己的缓存中', async () => {
    useSeriesUpdatesStore.getState().saveResult('alice', key, update([1, 2]))
    let finish!: (value: unknown) => void
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    const syncing = syncSeriesNotificationsNow()
    await vi.advanceTimersByTimeAsync(0)
    login('bob')
    useSeriesUpdatesStore.setState({ ownerId: 'bob', entries: {}, activeKeys: [] })
    finish({ data: [remote([1, 2, 3], [1, 2])], error: null })
    await syncing
    expect(useSeriesNotificationsStore.getState().syncOwner).toBe('bob')
    expect(useSeriesNotificationsStore.getState().accounts.bob).toBeUndefined()
    expect(notificationNeedsSync(local())).toBe(true)
    expect(useSeriesUpdatesStore.getState().entries).toEqual({})
  })

  it('切回前台拉取并节流上传，正常同步不自触发循环', async () => {
    useSeriesUpdatesStore.getState().saveResult('alice', key, update([1, 2, 3]))
    mocks.rpc.mockImplementation((_name, args) =>
      Promise.resolve({
        data: [
          remote(
            [1, 2, 3],
            args.p_changes.some((row: { readEpisodes: number[] }) => row.readEpisodes.includes(3))
              ? [1, 2, 3]
              : [1, 2],
          ),
        ],
        error: null,
      }),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10000)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    useSeriesUpdatesStore
      .getState()
      .markRead('alice', key, useSeriesUpdatesStore.getState().entries[key])
    await vi.advanceTimersByTimeAsync(9999)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.rpc.mock.calls[1][1].p_changes[0].readEpisodes).toEqual([3])
    await vi.advanceTimersByTimeAsync(300000)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.rpc).toHaveBeenCalledTimes(3)
    expect(mocks.rpc.mock.calls[2][1].p_changes).toEqual([])
  })

  it('缺少迁移或返回无效数据时提示部署错误并保留待同步内容', async () => {
    useSeriesUpdatesStore.getState().saveResult('alice', key, update([1, 2]))
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } })
    await syncSeriesNotificationsNow()
    expect(useSeriesNotificationsStore.getState().error).toContain(
      '202610190001_series_notifications.sql',
    )
    expect(notificationNeedsSync(local())).toBe(true)
    mocks.rpc.mockResolvedValueOnce({
      data: [{ ...remote([1, 2], [1, 2]), vodId: 'another' }],
      error: null,
    })
    await syncSeriesNotificationsNow()
    expect(useSeriesNotificationsStore.getState().error).toContain('无效的资源数据')
    expect(notificationNeedsSync(local())).toBe(true)
  })
})
