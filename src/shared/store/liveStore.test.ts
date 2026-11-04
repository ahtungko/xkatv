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
          channelCount: 1,
          updatedAt: '',
        },
        {
          id: 'sub_2',
          name: '源 2',
          url: 'http://sub2.com',
          isEnabled: true,
          channels: [{ id: 'ch_2', name: '频道 2', url: 'http://c2.com', group: 'G2', subscriptionId: 'sub_2' }],
          channelCount: 1,
          updatedAt: '',
        },
      ],
      cachedChannels: [
        { id: 'sub_1_ch_1', name: '频道 1', url: 'http://c1.com', group: 'G1', subscriptionId: 'sub_1' },
        { id: 'sub_2_ch_2', name: '频道 2', url: 'http://c2.com', group: 'G2', subscriptionId: 'sub_2' },
      ],
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `#EXTM3U\n#EXTINF:-1,新频道 1\nhttp://c1-new.com`,
    }))

    await useLiveStore.getState().refreshSubscription('sub_1')

    const state = useLiveStore.getState()
    expect(state.cachedChannels).toHaveLength(2)
    expect(state.cachedChannels.some(c => c.name === '新频道 1')).toBe(true)
    expect(state.cachedChannels.some(c => c.name === '频道 2')).toBe(true)
  })

  it('禁用或删除订阅时立即清除缓存频道与激活状态 (P2)', () => {
    const ch1 = { id: 'sub_1_ch_1', name: '频道 1', url: 'http://c1.com', group: 'G1', subscriptionId: 'sub_1' }
    const ch2 = { id: 'sub_2_ch_2', name: '频道 2', url: 'http://c2.com', group: 'G2', subscriptionId: 'sub_2' }

    useLiveStore.setState({
      subscriptions: [
        { id: 'sub_1', name: '源 1', url: 'http://sub1.com', isEnabled: true, channels: [ch1], channelCount: 1, updatedAt: '' },
        { id: 'sub_2', name: '源 2', url: 'http://sub2.com', isEnabled: true, channels: [ch2], channelCount: 1, updatedAt: '' },
      ],
      cachedChannels: [ch1, ch2],
      activeChannel: ch1,
    })

    useLiveStore.getState().updateSubscription('sub_1', { isEnabled: false })
    let state = useLiveStore.getState()
    expect(state.cachedChannels).toHaveLength(1)
    expect(state.cachedChannels[0].id).toBe('sub_2_ch_2')
    // 原激活频道被禁用后重置
    expect(state.activeChannel?.id).toBe('sub_2_ch_2')

    useLiveStore.getState().deleteSubscription('sub_2')
    state = useLiveStore.getState()
    expect(state.cachedChannels).toHaveLength(0)
    expect(state.activeChannel).toBeNull()
  })

  it('刷新失败时保留原有缓存并向外抛出错误 (P2)', async () => {
    const ch1 = { id: 'sub_1_ch_1', name: '频道 1', url: 'http://c1.com', group: 'G1', subscriptionId: 'sub_1' }

    useLiveStore.setState({
      subscriptions: [
        { id: 'sub_1', name: '源 1', url: 'http://sub1.com', isEnabled: true, channels: [ch1], channelCount: 1, updatedAt: '' },
      ],
      cachedChannels: [ch1],
    })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')))

    await expect(useLiveStore.getState().refreshSubscription('sub_1')).rejects.toThrow()
    // 缓存依然存在
    expect(useLiveStore.getState().cachedChannels).toEqual([ch1])

    // 全量刷新也同样抛出并保留
    await expect(useLiveStore.getState().refreshAllSubscriptions()).rejects.toThrow()
    expect(useLiveStore.getState().cachedChannels).toEqual([ch1])
  })

  it('不同订阅下同名频道分配独立唯一ID防止碰撞 (P2)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `#EXTM3U\n#EXTINF:-1,CCTV-1\nhttp://cctv.com`,
    }))

    await useLiveStore.getState().addSubscription({
      name: '源 A',
      url: 'http://a.com',
      isEnabled: true,
    })
    await useLiveStore.getState().addSubscription({
      name: '源 B',
      url: 'http://b.com',
      isEnabled: true,
    })

    const state = useLiveStore.getState()
    expect(state.cachedChannels).toHaveLength(2)
    // 两个 ID 必须不同！
    expect(state.cachedChannels[0].id).not.toBe(state.cachedChannels[1].id)
  })

  it('全量刷新并发时不覆盖期间的订阅修改 (P2)', async () => {
    const sub1 = { id: 'sub_1', name: '源 1', url: 'http://sub1.com', isEnabled: true, channels: [], channelCount: 0, updatedAt: '' }
    const sub2 = { id: 'sub_2', name: '源 2', url: 'http://sub2.com', isEnabled: true, channels: [], channelCount: 0, updatedAt: '' }

    useLiveStore.setState({
      subscriptions: [sub1, sub2],
      cachedChannels: [],
    })

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      // 模拟请求期间，用户删除了 sub_2
      if (url.includes('sub1.com')) {
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

  it('initializeEnvSubscriptions 能正常执行初始化', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `#EXTM3U\n#EXTINF:-1,C1\nhttp://c1.com`,
    }))

    await useLiveStore.getState().initializeEnvSubscriptions()
    const state = useLiveStore.getState()
    expect(state.isLoading).toBe(false)
  })
})

it('updates an environment source URL with the same generated ID', async () => {
  const old = { id: 'env_live_0', name: 'Env', url: 'https://old.test/list', isEnabled: true }
  useLiveStore.setState({ subscriptions: [old], cachedChannels: [], activeChannel: null })
  vi.stubGlobal('__XKA_RUNTIME_CONFIG__', {
    XKA_INITIAL_LIVE_SUBSCRIPTIONS: 'https://new.test/list',
  })
  const fetchMock = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      text: async () => '#EXTM3U\n#EXTINF:-1,C1\nhttps://new.test/live.m3u8',
    })
  vi.stubGlobal('fetch', fetchMock)
  await useLiveStore.getState().initializeEnvSubscriptions()
  expect(useLiveStore.getState().subscriptions[0].url).toBe('https://new.test/list')
  expect(fetchMock).toHaveBeenCalledWith('https://new.test/list')
  vi.unstubAllGlobals()
})
it.each(['refreshSubscription', 'refreshAllSubscriptions'] as const)(
  'updates the active URL during %s',
  async action => {
    const channel = { id: 'sub_ch_0_C1', name: 'C1', group: '', url: 'https://old.test/live' }
    useLiveStore.setState({
      subscriptions: [
        { id: 'sub', name: 'Sub', url: 'https://list.test', isEnabled: true, channels: [channel] },
      ],
      cachedChannels: [channel],
      activeChannel: channel,
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          text: async () => '#EXTM3U\n#EXTINF:-1,C1\nhttps://new.test/live',
        }),
    )
    await useLiveStore.getState()[action]('sub')
    expect(useLiveStore.getState().activeChannel?.url).toBe('https://new.test/live')
    vi.unstubAllGlobals()
  },
)
