import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLiveStore } from './liveStore'

describe('liveStore', () => {
  beforeEach(() => {
    useLiveStore.setState({
      subscriptions: [],
      cachedChannels: [],
      activeChannel: null,
      selectedCategory: 'all',
      searchKeyword: '',
      isLoading: false,
      error: null,
    })
    vi.unstubAllGlobals()
  })

  it('初始状态为空或来自初始配置', () => {
    const state = useLiveStore.getState()
    expect(state.subscriptions).toBeDefined()
    expect(state.activeChannel).toBeNull()
  })

  it('设置与清除活跃频道不产生播放历史', () => {
    const channel = {
      id: 'test_1',
      name: '测试频道',
      url: 'http://test.example/live.m3u8',
      group: '央视频道',
    }

    useLiveStore.getState().setActiveChannel(channel)
    expect(useLiveStore.getState().activeChannel).toEqual(channel)

    useLiveStore.getState().setActiveChannel(null)
    expect(useLiveStore.getState().activeChannel).toBeNull()
  })

  it('添加订阅并解析播放列表', async () => {
    const mockM3u = `#EXTM3U
#EXTINF:-1 group-title="央视频道",CCTV-1
http://stream.example/cctv1.m3u8`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockM3u,
    }))

    await useLiveStore.getState().addSubscription({
      name: '测试订阅',
      url: 'http://example.com/playlist.m3u8',
      isEnabled: true,
    })

    const state = useLiveStore.getState()
    expect(state.subscriptions).toHaveLength(1)
    expect(state.subscriptions[0].name).toBe('测试订阅')
    expect(state.cachedChannels).toHaveLength(1)
    expect(state.cachedChannels[0].name).toBe('CCTV-1')
  })

  it('刷新单个订阅时保留其他订阅的频道 (P2)', async () => {
    useLiveStore.setState({
      subscriptions: [
        {
          id: 'sub_1',
          name: '源 1',
          url: 'http://sub1.com',
          isEnabled: true,
          channels: [{ id: 'ch_1', name: '频道 1', url: 'http://c1.com', group: 'G1', subscriptionId: 'sub_1' }],
        },
        {
          id: 'sub_2',
          name: '源 2',
          url: 'http://sub2.com',
          isEnabled: true,
          channels: [{ id: 'ch_2', name: '频道 2', url: 'http://c2.com', group: 'G2', subscriptionId: 'sub_2' }],
        },
      ],
      cachedChannels: [
        { id: 'ch_1', name: '频道 1', url: 'http://c1.com', group: 'G1', subscriptionId: 'sub_1' },
        { id: 'ch_2', name: '频道 2', url: 'http://c2.com', group: 'G2', subscriptionId: 'sub_2' },
      ],
    })

    const mockM3uUpdated = `#EXTM3U
#EXTINF:-1 group-title="G1",频道 1 新版
http://c1-new.com`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockM3uUpdated,
    }))

    await useLiveStore.getState().refreshSubscription('sub_1')

    const state = useLiveStore.getState()
    expect(state.cachedChannels).toHaveLength(2)
    // sub_1 的频道已更新
    expect(state.cachedChannels.some(c => c.name === '频道 1 新版')).toBe(true)
    // sub_2 的频道依然保留！
    expect(state.cachedChannels.some(c => c.name === '频道 2')).toBe(true)
  })

  it('停用或删除订阅时即时清理频道缓存与活跃播放频道 (P2)', () => {
    const ch1 = { id: 'sub_1_ch_1', name: '频道 1', url: 'http://c1.com', group: 'G1', subscriptionId: 'sub_1' }
    const ch2 = { id: 'sub_2_ch_2', name: '频道 2', url: 'http://c2.com', group: 'G2', subscriptionId: 'sub_2' }

    useLiveStore.setState({
      subscriptions: [
        { id: 'sub_1', name: '源 1', url: 'http://sub1.com', isEnabled: true, channels: [ch1] },
        { id: 'sub_2', name: '源 2', url: 'http://sub2.com', isEnabled: true, channels: [ch2] },
      ],
      cachedChannels: [ch1, ch2],
      activeChannel: ch1,
    })

    // 停用 sub_1
    useLiveStore.getState().updateSubscription('sub_1', { isEnabled: false })
    let state = useLiveStore.getState()
    expect(state.cachedChannels).toHaveLength(1)
    expect(state.cachedChannels[0].id).toBe('sub_2_ch_2')
    // 活跃频道自动重置为剩余可用频道或 null
    expect(state.activeChannel?.id).toBe('sub_2_ch_2')

    // 删除 sub_2
    useLiveStore.getState().deleteSubscription('sub_2')
    state = useLiveStore.getState()
    expect(state.subscriptions).toHaveLength(1)
    expect(state.cachedChannels).toHaveLength(0)
    expect(state.activeChannel).toBeNull()
  })

  it('刷新失败时保留原有缓存并向外抛出错误 (P2)', async () => {
    const ch1 = { id: 'sub_1_ch_1', name: '频道 1', url: 'http://c1.com', group: 'G1', subscriptionId: 'sub_1' }

    useLiveStore.setState({
      subscriptions: [
        { id: 'sub_1', name: '源 1', url: 'http://sub1.com', isEnabled: true, channels: [ch1] },
      ],
      cachedChannels: [ch1],
    })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')))

    // refreshSubscription 应当抛出异常
    await expect(useLiveStore.getState().refreshSubscription('sub_1')).rejects.toThrow()
    // 缓存依然完好无损
    expect(useLiveStore.getState().cachedChannels).toEqual([ch1])

    // refreshAllSubscriptions 也应当抛出异常
    await expect(useLiveStore.getState().refreshAllSubscriptions()).rejects.toThrow()
    // 缓存依然不被清空
    expect(useLiveStore.getState().cachedChannels).toEqual([ch1])
  })

  it('两个包含相同频道的订阅不会发生 ID 碰撞 (P2)', async () => {
    const mockM3u = `#EXTM3U
#EXTINF:-1 group-title="央视频道",CCTV-1
http://stream.example/cctv1.m3u8`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockM3u,
    }))

    await useLiveStore.getState().addSubscription({
      name: '源 A',
      url: 'http://a.com/live.m3u',
      isEnabled: true,
    })

    await useLiveStore.getState().addSubscription({
      name: '源 B',
      url: 'http://b.com/live.m3u',
      isEnabled: true,
    })

    const state = useLiveStore.getState()
    expect(state.cachedChannels).toHaveLength(2)
    // 两个频道的 ID 必须包含各自的订阅 ID 前缀，完全不相等
    expect(state.cachedChannels[0].id).not.toBe(state.cachedChannels[1].id)
    expect(state.cachedChannels[0].subscriptionId).toBe(state.subscriptions[0].id)
    expect(state.cachedChannels[1].subscriptionId).toBe(state.subscriptions[1].id)
  })

  it('批量刷新期间发生的并发订阅删除/修改不会被快照覆盖 (P2)', async () => {
    useLiveStore.setState({
      subscriptions: [
        { id: 'sub_1', name: '源 1', url: 'http://s1.com', isEnabled: true },
        { id: 'sub_2', name: '源 2', url: 'http://s2.com', isEnabled: true },
      ],
    })

    // 模拟 fetch 过程中用户删除了 sub_2
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('s1.com')) {
        // 在 s1 抓取中途，用户在界面上删除了 sub_2
        useLiveStore.getState().deleteSubscription('sub_2')
        return {
          ok: true,
          text: async () => `#EXTM3U\n#EXTINF:-1,C1\nhttp://c1.com`,
        }
      }
      return {
        ok: true,
        text: async () => `#EXTM3U\n#EXTINF:-1,C2\nhttp://c2.com`,
      }
    }))

    await useLiveStore.getState().refreshAllSubscriptions()

    const state = useLiveStore.getState()
    // sub_2 绝不能被恢复！
    expect(state.subscriptions.some(s => s.id === 'sub_2')).toBe(false)
    expect(state.subscriptions).toHaveLength(1)
    expect(state.subscriptions[0].id).toBe('sub_1')
  })
})
