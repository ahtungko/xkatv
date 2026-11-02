import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useFavoritesStore } from '@/features/favorites/store/favoritesStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useSettingStore } from '@/shared/store/settingStore'
import type { ViewingHistoryItem } from '@/shared/types'
import { recordKey, type SyncRecord } from './records'
import { useSeriesNotificationsStore } from '@/features/favorites/store/seriesNotificationsStore'
import { useSeriesUpdatesStore } from '@/features/favorites/store/seriesUpdatesStore'

const mocks = vi.hoisted(() => ({
  authCallback: null as null | ((event: string, session: Session | null) => void),
  rpc: vi.fn(),
  range: vi.fn(),
}))
vi.mock('./client', () => ({
  syncClient: {
    auth: {
      onAuthStateChange: (callback: typeof mocks.authCallback) => {
        mocks.authCallback = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
    rpc: (...args: unknown[]) => ({ setHeader: () => mocks.rpc(...args) }),
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => ({
              range: (...args: unknown[]) => ({ setHeader: () => mocks.range(...args) }),
            }),
          }),
        }),
      }),
    }),
  },
}))

import { startSync, syncNow, useSyncStatus } from './service'

const item = (vodId: string): ViewingHistoryItem => ({
  recordType: 'cms',
  title: vodId,
  imageUrl: '',
  episodeIndex: 0,
  sourceCode: 'source',
  sourceName: 'Source',
  vodId,
  timestamp: 100,
  playbackPosition: 30,
  duration: 120,
})
const legacyFavorite = (): SyncRecord => ({
  kind: 'favorite', item_key: 'tmdb_tv_282326', modified_at: 100, mutation_id: 'legacy', deleted: false,
  value: {
    id: 'tmdb_tv_282326', addedAt: 1, updatedAt: 2, sourceType: 'tmdb',
    watchStatus: 'watching', tags: ['追更'], notes: '保留备注',
    tracking: { enabled: true, seasonNumber: 1,
      bindings: { '1': { sourceCode: 's', sourceName: 'S', vodId: 12345, title: '剧' } },
      progress: { '1': { completedEpisode: 12, calibratedAt: 100 } },
    },
    media: { id: 282326, mediaType: 'tv', title: '剧' },
  },
})
const session = (id: string) =>
  ({ access_token: `token-${id}`, user: { id, email: `${id}@example.com` } }) as Session
let stop: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useSeriesNotificationsStore.setState({ accounts: {} })
  useSeriesUpdatesStore.setState({ ownerId: null, entries: {}, activeKeys: [] })
  useFavoritesStore.setState({ favorites: [] })
  useViewingHistoryStore.setState({ viewingHistory: [item('guest')] })
  useSettingStore.getState().resetSettings()
  mocks.rpc.mockReset().mockResolvedValue({ error: null })
  mocks.range.mockReset().mockResolvedValue({ data: [], error: null })
  useAuthStore.setState({ session: null, account: null })
  mocks.authCallback = (_event, value) =>
    useAuthStore.setState({
      session: value,
      account: value
        ? {
            id: value.user.id,
            username: value.user.id,
            role: 'user',
            enabled: true,
            allow_nsfw: false,
            created_at: '2026-10-01',
            devices: [],
          }
        : null,
    })
  stop = startSync()
})
afterEach(() => {
  stop?.()
  vi.useRealTimers()
})

describe('cloud sync lifecycle', () => {
  it('旧云端收藏可正常下载、恢复进度并保留原记录时钟，不再阻塞历史同步', async () => {
    const favorite = legacyFavorite()
    const history: SyncRecord = {
      kind: 'history', item_key: 'cms::source::movie::0', value: item('movie'),
      modified_at: 100, mutation_id: 'history', deleted: false,
    }
    mocks.range.mockResolvedValue({ data: [favorite, history], error: null })
    mocks.authCallback!('SIGNED_IN', session('alice'))
    await syncNow()
    expect(useSyncStatus.getState()).toMatchObject({ status: '已同步', error: null })
    expect(useFavoritesStore.getState().favorites[0]).toMatchObject({
      id: 'tmdb_tv_282326', notes: '保留备注',
      tracking: { bindings: { '1': { vodId: '12345' } },
        progress: { '1': { completedEpisode: 12 } } },
    })
    expect(useViewingHistoryStore.getState().viewingHistory[0].vodId).toBe('movie')
    const cache = JSON.parse(localStorage.getItem('xkatv-cloud-v1:alice')!)
    expect(cache[recordKey(favorite)]).toMatchObject({
      modified_at: 100, mutation_id: 'legacy', pending: false,
      value: { tracking: { bindings: { '1': { vodId: '12345' } } } },
    })
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'sync_user_records')).toHaveLength(0)
  })

  it('旧本机缓存中的待上传收藏先规范化，再上传且保留离线编辑', async () => {
    const favorite = legacyFavorite()
    localStorage.setItem('xkatv-cloud-v1:alice', JSON.stringify({
      [recordKey(favorite)]: { ...favorite, pending: true },
    }))
    mocks.authCallback!('SIGNED_IN', session('alice'))
    expect(useFavoritesStore.getState().favorites[0].id).toBe(favorite.item_key)
    await syncNow()
    const uploads = mocks.rpc.mock.calls.filter(([name]) => name === 'sync_user_records')
    expect(uploads).toHaveLength(1)
    expect(uploads[0][1].changes[0]).toMatchObject({
      modified_at: 100, mutation_id: 'legacy',
      value: { notes: '保留备注', tracking: { bindings: { '1': { vodId: '12345' } } } },
    })
    expect(useSyncStatus.getState().error).toBeNull()
  })

  it('不可修复的数据提示具体字段，不修改云端记录或制造删除标记', async () => {
    const favorite = legacyFavorite()
    const value = favorite.value as Record<string, unknown>
    value.tracking = { enabled: true, bindings: {
      '1': { sourceCode: 's', sourceName: 'S', vodId: 'https://example.com/private', title: '剧' },
    } }
    mocks.range.mockResolvedValue({ data: [favorite], error: null })
    mocks.authCallback!('SIGNED_IN', session('alice'))
    await syncNow()
    expect(useSyncStatus.getState().error).toContain('favorite/tmdb_tv_282326')
    expect(useSyncStatus.getState().error).toContain('tracking.bindings.1.vodId')
    expect(useSyncStatus.getState().error).not.toContain('https://example.com/private')
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'sync_user_records')).toHaveLength(0)
    const cache = JSON.parse(localStorage.getItem('xkatv-cloud-v1:alice')!)
    expect(cache[recordKey(favorite)]).toBeUndefined()
  })
  it('replaces stale progress on disk with the server playback owner after a rejected upload', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    const oldLease = '00000000-0000-4000-8000-000000000001'
    const newLease = '00000000-0000-4000-8000-000000000002'
    useViewingHistoryStore
      .getState()
      .addViewingHistory({ ...item('movie'), playbackLeaseId: oldLease, playbackPosition: 90 })
    const remote: SyncRecord = {
      kind: 'history',
      item_key: 'cms::source::movie::0',
      value: { ...item('movie'), playbackLeaseId: newLease, playbackPosition: 42 },
      modified_at: 100,
      mutation_id: 'server',
      deleted: false,
    }
    mocks.range.mockResolvedValue({ data: [remote], error: null })
    await syncNow()
    expect(useViewingHistoryStore.getState().viewingHistory[0].playbackPosition).toBe(42)
    const cache = JSON.parse(localStorage.getItem('xkatv-cloud-v1:alice')!)
    expect(cache[recordKey(remote)].value.playbackLeaseId).toBe(newLease)
    expect(cache[recordKey(remote)].pending).toBe(false)
  })
  it('restores guest data on sign-out and isolates account caches', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    useViewingHistoryStore.getState().addViewingHistory(item('alice-private'))
    await syncNow()
    mocks.authCallback!('SIGNED_OUT', null)
    expect(useViewingHistoryStore.getState().viewingHistory.map(row => row.vodId)).toEqual([
      'guest',
    ])
    mocks.authCallback!('SIGNED_IN', session('bob'))
    expect(useViewingHistoryStore.getState().viewingHistory).toEqual([])
    mocks.authCallback!('SIGNED_IN', session('alice'))
    expect(
      useViewingHistoryStore.getState().viewingHistory.some(row => row.vodId === 'alice-private'),
    ).toBe(true)
  })

  it('retains queued edits after network failure and reload', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    mocks.rpc.mockResolvedValue({ error: { message: 'Network unavailable' } })
    useViewingHistoryStore.getState().addViewingHistory(item('offline'))
    await syncNow()
    expect(useSyncStatus.getState().error).toBe('Network unavailable')
    stop!()
    stop = startSync()
    mocks.authCallback!('INITIAL_SESSION', session('alice'))
    mocks.rpc.mockResolvedValue({ error: null })
    await syncNow()
    const sent = mocks.rpc.mock.calls[mocks.rpc.mock.calls.length - 1][1].changes as SyncRecord[]
    expect(sent.some(row => row.item_key.includes('offline'))).toBe(true)
  })

  it('ignores responses from an account that signed out during upload', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    useViewingHistoryStore.getState().addViewingHistory(item('guest'))
    let resolve!: (value: { error: null }) => void
    mocks.rpc.mockReturnValueOnce(
      new Promise(result => {
        resolve = result
      }),
    )
    const syncing = syncNow()
    mocks.authCallback!('SIGNED_OUT', null)
    mocks.authCallback!('SIGNED_IN', session('bob'))
    resolve({ error: null })
    await syncing
    expect(useSyncStatus.getState().username).toBe('bob')
    expect(mocks.range).not.toHaveBeenCalled()
  })

  it('does not lose a progress update made while an upload is in flight', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    useViewingHistoryStore.getState().addViewingHistory(item('guest'))
    let resolve!: (value: { error: null }) => void
    mocks.rpc.mockReturnValueOnce(
      new Promise(result => {
        resolve = result
      }),
    )
    const syncing = syncNow()
    useViewingHistoryStore.getState().addViewingHistory({ ...item('guest'), playbackPosition: 70 })
    resolve({ error: null })
    await syncing
    const cache = JSON.parse(localStorage.getItem('xkatv-cloud-v1:alice')!)
    const key = recordKey({ kind: 'history', item_key: 'cms::source::guest::0' })
    expect(cache[key].pending).toBe(true)
    expect(cache[key].value.playbackPosition).toBe(70)
  })

  it('restores guest data when a saved session is missing on reload', () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    useViewingHistoryStore.getState().addViewingHistory(item('alice-private'))
    stop!()
    stop = startSync()
    mocks.authCallback!('INITIAL_SESSION', null)
    expect(useViewingHistoryStore.getState().viewingHistory.map(row => row.vodId)).toEqual([
      'guest',
    ])
  })

  it('播放中高频定时同步或暂停时仅推送增量更改，不重复下载云端全量数据', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    // 初始全量同步已完成
    await syncNow({ mode: 'full' })
    expect(mocks.range).toHaveBeenCalledTimes(1)
    mocks.range.mockClear()
    mocks.rpc.mockClear()

    // 播放中更新历史记录
    useViewingHistoryStore
      .getState()
      .addViewingHistory({ ...item('watching-ep-1'), playbackPosition: 45 })

    // 执行仅上传增量同步（如播放器 30s 定时或暂停保存）
    await syncNow({ mode: 'upload' })

    // 验证：待同步的播放进度已上传
    const uploads = mocks.rpc.mock.calls.filter(([name]) => name === 'sync_user_records')
    expect(uploads).toHaveLength(1)
    expect(uploads[0][1].changes[0]).toMatchObject({
      kind: 'history',
      value: expect.objectContaining({ vodId: 'watching-ep-1', playbackPosition: 45 }),
    })

    // 验证：绝对不触发全量远端下载（mocks.range 零调用）
    expect(mocks.range).not.toHaveBeenCalled()
    expect(useSyncStatus.getState()).toMatchObject({ status: '已上传', error: null })
  })

  it('仅上传不会更新完整同步时间，页面恢复时按完整同步时间检查冷却期', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    await vi.runAllTimersAsync()
    const fullSyncTime = useSyncStatus.getState().lastSynced
    expect(fullSyncTime).not.toBeNull()

    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1)
    useViewingHistoryStore.getState().addViewingHistory(item('recent-upload'))
    await syncNow({ mode: 'upload' })
    expect(useSyncStatus.getState().lastSynced).toBe(fullSyncTime)

    mocks.range.mockClear()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(mocks.range).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(useSyncStatus.getState().lastSynced).toBeGreaterThan(fullSyncTime!))
  })

  it.each(['pause', 'pagehide'])('%s 存储失败时仍尝试上传内存中的更改', async eventName => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    await vi.runAllTimersAsync()
    useViewingHistoryStore.getState().addViewingHistory(item('storage-failure'))
    mocks.rpc.mockClear()
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'xkatv-cloud-v1:alice') throw new Error('storage unavailable')
      return originalSetItem.call(this, key, value)
    })

    if (eventName === 'pause') {
      document.dispatchEvent(new Event('pause'))
      vi.runAllTicks()
    } else {
      window.dispatchEvent(new Event('pagehide'))
    }

    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalled())
    await vi.waitFor(() => expect(useSyncStatus.getState().error).toBe('storage unavailable'))
  })

  it('并发同步请求在 busy 期间入队，并在当前同步完成后自动补跑，且 full 优先级高于 upload', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    await syncNow({ mode: 'full' })
    mocks.range.mockClear()
    mocks.rpc.mockClear()

    let resolveRpc1!: (value: { error: null }) => void
    mocks.rpc.mockReturnValueOnce(
      new Promise(res => {
        resolveRpc1 = res
      }),
    )

    useViewingHistoryStore.getState().addViewingHistory({ ...item('first'), playbackPosition: 10 })
    const sync1 = syncNow({ mode: 'upload' })

    // 在 sync 1 运行期间（busy === true），新的请求入队
    useViewingHistoryStore.getState().addViewingHistory({ ...item('second'), playbackPosition: 20 })
    const sync2 = syncNow({ mode: 'upload' })
    const sync3 = syncNow({ mode: 'full' })

    resolveRpc1({ error: null })
    await sync1

    // sync2 和 sync3 在排队执行中被升级为 full 并在其执行完成后 resolve
    await Promise.all([sync2, sync3])

    expect(mocks.range).toHaveBeenCalledTimes(1)
    const uploads = mocks.rpc.mock.calls.filter(([name]) => name === 'sync_user_records')
    expect(uploads.length).toBeGreaterThanOrEqual(2)
    expect(useSyncStatus.getState()).toMatchObject({ status: '已同步', error: null })
  })

  it('播放中 30 秒定时器在 5 分钟内仅执行上传，超过 5 分钟执行完整拉取对齐', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    // 等待登录后的初始同步定时器完成
    await vi.runAllTimersAsync()
    mocks.range.mockClear()
    mocks.rpc.mockClear()

    // 产生播放记录（触发 30s 节流定时器）
    useViewingHistoryStore.getState().addViewingHistory({ ...item('ep1'), playbackPosition: 30 })

    // 前进 30 秒，触发定时器
    await vi.advanceTimersByTimeAsync(30_000)

    // 此时距离上次全量对齐未满 5 分钟，应仅上传，不触发全量远端拉取
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.range).not.toHaveBeenCalled()
    expect(useSyncStatus.getState().status).toBe('已上传')

    mocks.rpc.mockClear()

    // 播放持续进行，5 分钟后再产生新播放记录
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    useViewingHistoryStore.getState().addViewingHistory({ ...item('ep2'), playbackPosition: 60 })
    // 前进 30 秒触发定时同步
    await vi.advanceTimersByTimeAsync(30_000)

    // 此时已超过 5 分钟，应触发全量对齐（range 被调用）
    expect(mocks.range).toHaveBeenCalledTimes(1)
    expect(useSyncStatus.getState().status).toBe('已同步')
  })

  it('暂停与页面隐藏时优先保存至本地存储，并触发仅上传', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    await vi.runAllTimersAsync()
    mocks.rpc.mockClear()
    mocks.range.mockClear()

    useViewingHistoryStore.getState().addViewingHistory({ ...item('paused-ep'), playbackPosition: 99 })

    // 模拟 pause 事件
    document.dispatchEvent(new Event('pause'))
    // 允许 pause 的 microtask 执行完成
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalled())

    const cache = JSON.parse(localStorage.getItem('xkatv-cloud-v1:alice')!)
    const historyKey = recordKey({ kind: 'history', item_key: 'cms::source::paused-ep::0' })
    expect(cache[historyKey]).toBeDefined()
    expect(cache[historyKey].value.playbackPosition).toBe(99)

    // 验证仅上传，不触发全量远端拉取
    expect(mocks.range).not.toHaveBeenCalled()
    expect(useSyncStatus.getState().status).toBe('已上传')
  })

  it('切换账号时重置全量对齐时间与排队请求，避免状态泄露', async () => {
    mocks.authCallback!('SIGNED_IN', session('alice'))
    await syncNow({ mode: 'full' })
    mocks.range.mockClear()

    mocks.authCallback!('SIGNED_IN', session('bob'))
    await vi.runAllTimersAsync()
    expect(mocks.range).toHaveBeenCalledTimes(1)
    expect(useSyncStatus.getState().username).toBe('bob')
  })

  it('never uploads API credentials or proxy settings', async () => {
    useSettingStore.getState().setSystemSettings({ tmdbApiToken: 'private-token' })
    useSettingStore.getState().setNetworkSettings({ proxyUrl: 'https://private-proxy.example' })
    mocks.authCallback!('SIGNED_IN', session('alice'))
    useViewingHistoryStore.getState().addViewingHistory(item('check'))
    await syncNow()
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('private-token')
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('private-proxy')
  })
})
