// @vitest-environment jsdom
import { act, createElement } from 'react'

// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useWatchParty } from './useWatchParty'
import { resetWatchPartyStore, useWatchPartyStore } from '../store/watchPartyStore'

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn((cb?: (status: string) => void) => {
    cb?.('SUBSCRIBED')
    return mockChannel
  }),
  unsubscribe: vi.fn(),
  send: vi.fn().mockResolvedValue('ok'),
  track: vi.fn().mockResolvedValue(undefined),
  presenceState: vi.fn().mockReturnValue({}),
}

const mockSyncClient = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ data: 'open', error: null }),
}

vi.mock('@/shared/sync/client', () => ({
  get syncClient() {
    return mockSyncClient
  },
}))

const mockAccount = vi.hoisted(() => ({ id: 'account-1', username: 'testuser' }))
vi.mock('@/shared/store/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: { account: { id: string; username: string } }) => unknown) =>
    selector({ account: mockAccount }),
  ),
}))

const mockSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()

vi.mock('react-router', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}))

describe('useWatchParty', () => {
  let host: HTMLElement
  let root: Root
  let currentResult: ReturnType<typeof useWatchParty>

  function TestHarness(props: {
    onNotice?: (msg: string) => void
    onEpisode?: (ep: number) => void
    art?: import('artplayer').default | null
    currentVideoUrl?: string
    adFilteringEnabled?: boolean
    posterUrl?: string
  }) {
    currentResult = useWatchParty({
      art: props.art || null,
      selectedEpisode: 0,
      currentVideoUrl: props.currentVideoUrl,
      adFilteringEnabled: props.adFilteringEnabled,
      posterUrl: props.posterUrl,
      onSelectEpisode: props.onEpisode || vi.fn(),
      showNotice: props.onNotice || vi.fn(),
    })
    return null
  }

  beforeEach(() => {
    resetWatchPartyStore()
    vi.clearAllMocks()
    mockSyncClient.rpc.mockReset().mockResolvedValue({ data: 'open', error: null })
    sessionStorage.clear()
    mockAccount.id = 'account-1'
    mockSearchParams.delete('partyRoom')
    mockSearchParams.delete('partyMode')
    mockSearchParams.delete('inviter')
    mockSearchParams.delete('partyInviter')
    mockSearchParams.delete('poster')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('初始状态未激活放映室', async () => {
    await act(async () => {
      root.render(createElement(TestHarness))
    })

    expect(currentResult.isPartyActive).toBe(false)
    expect(currentResult.isHost).toBe(false)
    expect(currentResult.roomId).toBeNull()
    expect(currentResult.isSupabaseAvailable).toBe(true)
  })

  it('创建房间生成正确的房间号并建立频道', async () => {
    await act(async () => {
      root.render(createElement(TestHarness))
    })

    let url = ''
    await act(async () => {
      url = await currentResult.createParty('host_only')
    })

    expect(currentResult.isPartyActive).toBe(true)
    expect(currentResult.isHost).toBe(true)
    expect(currentResult.mode).toBe('host_only')
    expect(currentResult.roomId).toBeTruthy()
    expect(url).toContain('partyRoom=')
    expect(url).toContain('partyMode=host_only')
    expect(mockSyncClient.channel).toHaveBeenCalled()
    expect(mockChannel.track).toHaveBeenCalled()
    expect(mockSyncClient.rpc).toHaveBeenCalledWith('create_watch_party_room', expect.objectContaining({ p_room_id: currentResult.roomId }))
  })

  it('创建免登录影厅生成专属 /p/ 独立短链', async () => {
    await act(async () => {
      root.render(createElement(TestHarness, { posterUrl: 'https://example.com/long-poster.jpg' }))
    })

    let url = ''
    await act(async () => {
      url = await currentResult.createParty('guest_cinema')
    })

    expect(currentResult.isPartyActive).toBe(true)
    expect(currentResult.isHost).toBe(true)
    expect(currentResult.mode).toBe('guest_cinema')
    expect(url).toContain('/p/')
    expect(new URL(url).searchParams.has('poster')).toBe(false)
    expect(new URL(currentResult.inviteUrl).searchParams.has('poster')).toBe(false)
  })

  it('普通放映室分享地址也不包含海报地址', async () => {
    await act(async () => root.render(createElement(TestHarness, { posterUrl: 'https://example.com/long-poster.jpg' })))
    let url = ''
    await act(async () => { url = await currentResult.createParty('host_only') })
    expect(new URL(url).searchParams.has('poster')).toBe(false)
    expect(new URL(currentResult.inviteUrl).searchParams.has('poster')).toBe(false)
  })

  it('房主刷新后以房主身份恢复同一房间并清除退出记录', async () => {
    await act(async () => root.render(createElement(TestHarness)))
    await act(async () => { await currentResult.createParty('guest_cinema') })
    const room = currentResult.roomId!
    await act(async () => root.unmount())
    mockSearchParams.set('partyRoom', room)
    mockSearchParams.set('partyMode', 'guest_cinema')
    root = createRoot(host)
    await act(async () => root.render(createElement(TestHarness)))
    expect(currentResult.isHost).toBe(true)
    expect(currentResult.roomId).toBe(room)
    expect(mockChannel.track).toHaveBeenLastCalledWith(expect.objectContaining({ isHost: true }))
    await act(async () => { await currentResult.leaveParty() })
    expect(mockSyncClient.rpc).toHaveBeenCalledWith('close_watch_party_room', { p_room_id: room })
    expect(sessionStorage.getItem('xkatv-watch-party-host')).toBeNull()
    expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ type: 'room_closed' }),
    }))
  })

  it('服务端关闭失败时保留房主房间并提示重试', async () => {
    const notices: string[] = []
    await act(async () => root.render(createElement(TestHarness, { onNotice: msg => notices.push(msg) })))
    await act(async () => { await currentResult.createParty('guest_cinema') })
    mockSyncClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
    await act(async () => { await currentResult.leaveParty() })
    expect(currentResult.isHost).toBe(true)
    expect(currentResult.isPartyActive).toBe(true)
    expect(notices.some(notice => notice.includes('无法关闭放映厅'))).toBe(true)
    expect(mockChannel.send).not.toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ type: 'room_closed' }) }))
  })

  it('邀请链接或不同账号不能恢复此标签页保存的房主身份', async () => {
    sessionStorage.setItem('xkatv-watch-party-host', JSON.stringify({ roomId: 'room123', accountId: 'account-1', mode: 'host_only' }))
    mockAccount.id = 'account-2'
    mockSearchParams.set('partyRoom', 'room123')
    await act(async () => root.render(createElement(TestHarness)))
    expect(currentResult.isHost).toBe(false)
    expect(mockChannel.track).toHaveBeenCalledWith(expect.objectContaining({ isHost: false }))
  })

  it('房主主控模式下房主可广播播放状态', async () => {
    await act(async () => {
      root.render(createElement(TestHarness))
    })

    await act(async () => {
      await currentResult.createParty('host_only')
    })

    await act(async () => {
      currentResult.broadcastAction({
        type: 'play',
        time: 42,
      })
    })

    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'party_action',
        payload: expect.objectContaining({
          type: 'play',
          time: 42,
          senderName: 'testuser',
        }),
      }),
    )
  })

  it('退出房间清理频道和状态，且不会因 URL 参数延迟导致重复加入', async () => {
    // 模拟 URL 中含有房间号加入放映室
    mockSearchParams.set('partyRoom', 'room-exit-test')
    mockSearchParams.set('partyMode', 'host_only')
    mockSearchParams.set('inviter', 'Host')
    mockSearchParams.set('partyInviter', 'OldHost')
    mockSearchParams.set('poster', 'https://example.com/cover.jpg')

    const notices: string[] = []
    await act(async () => {
      root.render(
        createElement(TestHarness, {
          onNotice: (msg: string) => notices.push(msg),
        }),
      )
    })

    expect(currentResult.isPartyActive).toBe(true)
    expect(currentResult.roomId).toBe('room-exit-test')

    // 此时调用 leaveParty，即便 mockSearchParams 仍保留 room-exit-test，也不会再次触发已加入
    notices.length = 0
    await act(async () => {
      await currentResult.leaveParty()
    })

    expect(currentResult.isPartyActive).toBe(false)
    expect(currentResult.roomId).toBeNull()
    expect(notices).toContain('已退出同步放映室')
    expect(notices.some(n => n.includes('已加入放映室'))).toBe(false)
    const update = mockSetSearchParams.mock.calls.at(-1)?.[0]
    const cleaned = update(mockSearchParams) as URLSearchParams
    expect(cleaned.has('partyRoom')).toBe(false)
    expect(cleaned.has('inviter')).toBe(false)
    expect(cleaned.has('partyInviter')).toBe(false)
    expect(cleaned.has('poster')).toBe(false)
  })

  it('观众加入房间时自动发送 request_state 请求进度握手', async () => {
    mockSearchParams.set('partyRoom', 'room123')
    mockSearchParams.set('partyMode', 'host_only')

    await act(async () => {
      root.render(createElement(TestHarness))
    })

    expect(currentResult.isPartyActive).toBe(true)
    expect(currentResult.isHost).toBe(false)
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'party_action',
        payload: expect.objectContaining({
          type: 'request_state',
        }),
      }),
    )
  })

  it('观众播放器尚未准备好时保留房主的初始播放进度', async () => {
    mockSearchParams.set('partyRoom', 'room123')
    await act(async () => root.render(createElement(TestHarness)))
    const broadcast = mockChannel.on.mock.calls.find(call => call[0] === 'broadcast' && call[1]?.event === 'party_action')?.[2]
    await act(async () => broadcast({ payload: { type: 'state_sync', senderId: 'host', time: 42, isPlaying: true, episodeIndex: 0 } }))
    const art = { currentTime: 0, video: { paused: true }, on: vi.fn(), off: vi.fn(), play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() }
    await act(async () => root.render(createElement(TestHarness, { art: art as unknown as import('artplayer').default })))
    expect(art.currentTime).toBe(42)
    expect(art.play).toHaveBeenCalled()
  })

  it('初始状态指向其他集数时先切集，再应用进度', async () => {
    mockSearchParams.set('partyRoom', 'room123')
    await act(async () => root.render(createElement(TestHarness)))
    const broadcast = mockChannel.on.mock.calls.find(call => call[0] === 'broadcast' && call[1]?.event === 'party_action')?.[2]
    const onSelectEpisode = vi.fn()
    const first = { isReady: true, currentTime: 0, video: { paused: true }, on: vi.fn(), off: vi.fn(), play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() }
    let unbind!: () => void
    await act(async () => { unbind = useWatchPartyStore.getState().bindPlayer({ art: first as unknown as import('artplayer').default, selectedEpisode: 0, onSelectEpisode, showNotice: vi.fn() }) })
    await act(async () => broadcast({ payload: { type: 'state_sync', senderId: 'host', time: 88, isPlaying: true, episodeIndex: 2 } }))
    expect(onSelectEpisode).toHaveBeenCalledWith(2)
    expect(first.currentTime).toBe(0)
    const second = { ...first, currentTime: 0, play: vi.fn().mockResolvedValue(undefined) }
    await act(async () => { unbind(); unbind = useWatchPartyStore.getState().bindPlayer({ art: second as unknown as import('artplayer').default, selectedEpisode: 2, onSelectEpisode, showNotice: vi.fn() }) })
    expect(second.currentTime).toBe(88)
    expect(second.play).toHaveBeenCalled()
    unbind()
  })

  it('服务端房间已关闭时不恢复本地房主身份', async () => {
    sessionStorage.setItem('xkatv-watch-party-host', JSON.stringify({ roomId: 'room123', accountId: 'account-1', mode: 'guest_cinema' }))
    mockSyncClient.rpc.mockResolvedValueOnce({ data: 'closed', error: null })
    await act(async () => { await useWatchPartyStore.getState().restoreHostSessionIfNeeded() })
    expect(useWatchPartyStore.getState().isPartyActive).toBe(false)
    expect(mockSyncClient.channel).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('xkatv-watch-party-host')).toBeNull()
  })

  it('并发恢复请求只在服务端确认开放后连接一次', async () => {
    sessionStorage.setItem('xkatv-watch-party-host', JSON.stringify({ roomId: 'room123', accountId: 'account-1', mode: 'guest_cinema' }))
    let resolve!: (value: { data: string; error: null }) => void
    mockSyncClient.rpc.mockReturnValueOnce(new Promise(result => { resolve = result }))
    let first!: Promise<boolean>
    let second!: Promise<boolean>
    act(() => {
      first = useWatchPartyStore.getState().restoreHostSessionIfNeeded()
      second = useWatchPartyStore.getState().restoreHostSessionIfNeeded()
    })
    expect(mockSyncClient.channel).not.toHaveBeenCalled()
    await act(async () => { resolve({ data: 'open', error: null }); await Promise.all([first, second]) })
    expect(mockSyncClient.rpc).toHaveBeenCalledTimes(1)
    expect(mockSyncClient.channel).toHaveBeenCalledTimes(1)
    expect(useWatchPartyStore.getState().isHost).toBe(true)
  })

  it('普通房间收到房主结束消息后退出，旧地址不能让观众立刻重新加入', async () => {
    mockSearchParams.set('partyRoom', 'expired-room')
    const notices: string[] = []
    await act(async () => root.render(createElement(TestHarness, { onNotice: msg => notices.push(msg) })))
    const broadcast = mockChannel.on.mock.calls.find(call => call[0] === 'broadcast')?.[2]
    await act(async () => broadcast({ payload: { type: 'room_closed', senderId: 'host', message: '房主已解散放映厅' } }))
    expect(currentResult.isPartyActive).toBe(false)
    expect(notices).toContain('房主已解散放映厅')
  })

  it('普通房间打开旧邀请链接后没有房主，等待重连期后退出', async () => {
    vi.useFakeTimers()
    try {
      mockSearchParams.set('partyRoom', 'expired-room')
      mockChannel.presenceState.mockReturnValue({})
      await act(async () => root.render(createElement(TestHarness)))
      const presence = mockChannel.on.mock.calls.find(call => call[0] === 'presence')?.[2]
      await act(async () => presence())
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
      expect(currentResult.isPartyActive).toBe(false)
    } finally { vi.useRealTimers() }
  })

  it('普通房间房主在重连期内回来时保留房间', async () => {
    vi.useFakeTimers()
    try {
      mockSearchParams.set('partyRoom', 'room-reconnecting')
      mockChannel.presenceState.mockReturnValue({})
      await act(async () => root.render(createElement(TestHarness)))
      const presence = mockChannel.on.mock.calls.find(call => call[0] === 'presence')?.[2]
      await act(async () => presence())
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
      mockChannel.presenceState.mockReturnValue({ host: [{ clientId: 'host', isHost: true }] })
      await act(async () => presence())
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
      expect(currentResult.isPartyActive).toBe(true)
    } finally { vi.useRealTimers() }
  })

  it('创建放映室时在链接中嵌入当前登录账号作为邀请人', async () => {
    await act(async () => {
      root.render(createElement(TestHarness))
    })

    let normalUrl = ''
    let cinemaUrl = ''
    await act(async () => {
      normalUrl = await currentResult.createParty('host_only')
    })
    expect(normalUrl).toContain('inviter=testuser')

    await act(async () => {
      cinemaUrl = await currentResult.createParty('guest_cinema')
    })
    expect(cinemaUrl).toContain('i=testuser')
  })

  it('通过包含邀请人的链接加入时弹出专属欢迎提示', async () => {
    mockSearchParams.set('partyRoom', 'room-invite-test')
    mockSearchParams.set('partyMode', 'host_only')
    mockSearchParams.set('inviter', 'Nicholas')

    const notices: string[] = []
    await act(async () => {
      root.render(createElement(TestHarness, { onNotice: msg => notices.push(msg) }))
    })

    expect(notices.some(n => n.includes('Nicholas') && n.includes('邀请你'))).toBe(true)
  })

  it('免登录影厅房主心跳包含当前片源，帮助候播访客恢复', async () => {
    vi.useFakeTimers()
    try {
      const art = { currentTime: 42, video: { paused: false }, on: vi.fn(), off: vi.fn() }
      await act(async () => root.render(createElement(TestHarness, {
        art: art as unknown as import('artplayer').default, currentVideoUrl: 'https://example.com/video.m3u8', adFilteringEnabled: true,
      })))
      await act(async () => { await currentResult.createParty('guest_cinema') })
      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({
          type: 'heartbeat', videoUrl: 'https://example.com/video.m3u8', time: 42, isPlaying: true, adFilteringEnabled: true,
        }),
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('发送聊天消息通过实时频道广播并记录到本地消息列表', async () => {
    await act(async () => {
      root.render(createElement(TestHarness))
    })
    await act(async () => {
      await currentResult.createParty('host_only')
    })

    await act(async () => {
      await currentResult.sendChatMessage('大家好，准备开播！')
    })

    expect(currentResult.messages.length).toBe(1)
    expect(currentResult.messages[0].text).toBe('大家好，准备开播！')
    expect(currentResult.messages[0].isHost).toBe(true)
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'party_chat',
        payload: expect.objectContaining({
          text: '大家好，准备开播！',
          isHost: true,
        }),
      }),
    )
  })

  it('接收远端聊天消息并更新本地消息列表', async () => {
    await act(async () => {
      root.render(createElement(TestHarness))
    })
    await act(async () => {
      await currentResult.createParty('host_only')
    })

    const chatHandler = mockChannel.on.mock.calls.find(
      call => call[0] === 'broadcast' && call[1]?.event === 'party_chat',
    )?.[2]
    expect(chatHandler).toBeDefined()

    await act(async () => {
      chatHandler({
        payload: {
          id: 'chat-1',
          senderId: 'remote-user',
          senderName: '小李',
          text: '前排打卡！',
          timestamp: Date.now(),
        },
      })
    })

    expect(currentResult.messages.length).toBe(1)
    expect(currentResult.messages[0].text).toBe('前排打卡！')
    expect(currentResult.messages[0].senderName).toBe('小李')
  })

  it('发送失败时保留失败结果，不将消息显示为已发送', async () => {
    await act(async () => root.render(createElement(TestHarness)))
    await act(async () => { await currentResult.createParty('host_only') })
    mockChannel.send.mockResolvedValueOnce('error')
    let sent: boolean | undefined
    await act(async () => { sent = await currentResult.sendChatMessage('测试') })
    expect(sent).toBe(false)
    expect(currentResult.messages).toHaveLength(0)
  })

  it('忽略格式无效或超长的远端聊天内容', async () => {
    await act(async () => root.render(createElement(TestHarness)))
    await act(async () => { await currentResult.createParty('host_only') })
    const chatHandler = mockChannel.on.mock.calls.find(call => call[0] === 'broadcast' && call[1]?.event === 'party_chat')?.[2]
    await act(async () => {
      chatHandler({ payload: { id: 'bad', senderId: 'other', senderName: {}, text: {}, timestamp: Date.now() } })
      chatHandler({ payload: { id: 'long', senderId: 'other', senderName: 'x', text: 'x'.repeat(101), timestamp: Date.now() } })
    })
    expect(currentResult.messages).toHaveLength(0)
  })
})
