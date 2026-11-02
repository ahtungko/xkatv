// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

type MockPlayerOption = { customType: { m3u8: (a: unknown, b: string, c: unknown) => void } }
type MockHlsOption = { loader?: unknown }

// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const callbacks: Record<string, (...args: unknown[]) => void> = {}
  const player = {
    currentTime: 0,
    video: { paused: true },
    notice: { show: '' },
    template: { $player: document.createElement('div') },
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => { callbacks[event] = callback }),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    destroy: vi.fn(),
  }
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((callback: (status: string) => void) => { callback('SUBSCRIBED'); return channel }),
    send: vi.fn().mockResolvedValue('ok'), track: vi.fn(), unsubscribe: vi.fn(), presenceState: vi.fn().mockReturnValue({}),
  }
  const playerOptions: MockPlayerOption[] = []
  const hlsOptions: MockHlsOption[] = []
  return { callbacks, player, channel, playerOptions, hlsOptions }
})

vi.mock('artplayer', () => ({ default: class { constructor(options: MockPlayerOption) { mocks.playerOptions.push(options); return mocks.player } } }))
vi.mock('hls.js/dist/hls.light.mjs', () => ({ default: class {
  static isSupported() { return true }
  static DefaultConfig = { loader: class {} }
  constructor(options: MockHlsOption) { mocks.hlsOptions.push(options) }
  loadSource() {}
  attachMedia() {}
  destroy() {}
} }))
vi.mock('react-router', () => ({ useParams: () => ({ roomId: 'room' }), useNavigate: () => vi.fn() }))
vi.mock('@/shared/store/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ account: null }) }))
vi.mock('@/shared/sync/client', () => ({ syncClient: { channel: () => mocks.channel, removeChannel: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: 'open', error: null }) } }))

import GuestPartyView from './GuestPartyView'

describe('访客播放器进度同步', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  afterEach(async () => { await act(async () => root.unmount()); host.remove() })

  it('准备期间保留最新进度，准备完成后继续校正漂移', async () => {
    await act(async () => root.render(createElement(GuestPartyView)))
    const broadcast = mocks.channel.on.mock.calls.find(call => call[0] === 'broadcast')?.[2]
    expect(broadcast).toBeDefined()
    await act(async () => {
      broadcast({ payload: { type: 'state_sync', senderId: 'host', videoUrl: 'https://example.com/video.m3u8', time: 10, isPlaying: true, adFilteringEnabled: true } })
    })
    await vi.waitFor(() => expect(mocks.callbacks.ready).toBeDefined())
    expect(mocks.player.template.$player.querySelector('[aria-label="放映室聊天"]')).not.toBeNull()
    const chat = mocks.channel.on.mock.calls.find(call => call[0] === 'broadcast' && call[1]?.event === 'party_chat')?.[2]
    await act(async () => chat({ payload: { id: 'invalid', senderId: 'other', senderName: {}, text: {}, timestamp: 1 } }))
    expect(host.textContent).not.toContain('1 条吐槽')
    const input = host.querySelector('input') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(input, '访客消息')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    mocks.channel.send.mockResolvedValueOnce('error')
    const sendButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('发送'))!
    await act(async () => sendButton.click())
    expect(input.value).toBe('访客消息')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('发送失败')
    mocks.playerOptions.at(-1)!.customType.m3u8({}, 'https://example.com/video.m3u8', mocks.player)
    expect(mocks.hlsOptions.at(-1)!.loader).toBeTypeOf('function')
    await act(async () => {
      broadcast({ payload: { type: 'heartbeat', senderId: 'host', time: 12, isPlaying: true } })
      mocks.callbacks.ready()
    })
    expect(mocks.player.currentTime).toBe(12)
    expect(mocks.player.play).toHaveBeenCalled()
    await act(async () => {
      broadcast({ payload: { type: 'heartbeat', senderId: 'host', time: 13.2, isPlaying: true } })
    })
    expect(mocks.player.currentTime).toBe(13.2)
    mocks.player.play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
    await act(async () => {
      broadcast({ payload: { type: 'play', senderId: 'host', time: 20 } })
    })
    const resume = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('点击播放并同步'))
    expect(resume).toBeDefined()
    await act(async () => { resume?.click() })
    expect(mocks.player.currentTime).toBeGreaterThanOrEqual(20)
    const initialInstances = mocks.playerOptions.length
    await act(async () => {
      broadcast({ payload: { type: 'heartbeat', senderId: 'host', time: 21, isPlaying: true, adFilteringEnabled: false } })
    })
    await vi.waitFor(() => expect(mocks.playerOptions.length).toBeGreaterThan(initialInstances))
    mocks.playerOptions.at(-1)!.customType.m3u8({}, 'https://example.com/video.m3u8', mocks.player)
    expect(mocks.hlsOptions.at(-1)!.loader).toBeUndefined()

    await act(async () => {
      broadcast({ payload: { type: 'heartbeat', senderId: 'host', time: 0, isPlaying: false, isSelectingMedia: true } })
    })
    expect(host.textContent).toContain('正在全站挑选新片')
    expect(host.querySelector('#guest-player')).toBeNull()

    const previousInstances = mocks.playerOptions.length
    await act(async () => {
      broadcast({ payload: { type: 'episode', senderId: 'host', videoUrl: 'https://example.com/video.m3u8', time: 25, isPlaying: true, isSelectingMedia: false } })
    })
    expect(host.textContent).not.toContain('正在全站挑选新片')
    await vi.waitFor(() => expect(mocks.playerOptions.length).toBeGreaterThan(previousInstances))
    await act(async () => mocks.callbacks.ready())
    expect(mocks.player.currentTime).toBe(25)

    const beforeRapidSwitch = mocks.playerOptions.length
    await act(async () => {
      broadcast({ payload: { type: 'heartbeat', senderId: 'host', time: 0, isPlaying: false, isSelectingMedia: true } })
      broadcast({ payload: { type: 'episode', senderId: 'host', videoUrl: 'https://example.com/video.m3u8', time: 30, isPlaying: true } })
    })
    await vi.waitFor(() => expect(mocks.playerOptions.length).toBeGreaterThan(beforeRapidSwitch))
    await act(async () => mocks.callbacks.ready())
    expect(mocks.player.currentTime).toBe(30)
  })
})
