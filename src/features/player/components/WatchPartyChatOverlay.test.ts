// @vitest-environment jsdom
import { act, createElement } from 'react'

// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  WatchPartyChatOverlay,
  WatchPartyInlineBar,
} from './WatchPartyChatOverlay'
import type { WatchPartyChatMessage } from '../hooks/useWatchParty'

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  nativeSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('WatchPartyChatOverlay', () => {
  let host: HTMLElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('展示聊天和弹幕控制按钮，并能触发弹幕切换', async () => {
    const handleToggleDanmaku = vi.fn()
    const handleSendMessage = vi.fn().mockResolvedValue(true)

    await act(async () => {
      root.render(
        createElement(WatchPartyChatOverlay, {
          playerOverlayContainer: null,
          messages: [],
          onSendMessage: handleSendMessage,
          danmakuEnabled: true,
          onToggleDanmaku: handleToggleDanmaku,
          isHost: true,
        }),
      )
    })

    const danmakuBtn = host.querySelector('button[aria-label="关闭弹幕"]') as HTMLButtonElement
    expect(danmakuBtn).not.toBeNull()

    await act(async () => {
      danmakuBtn.click()
    })
    expect(handleToggleDanmaku).toHaveBeenCalled()
  })

  it('点击展开聊天抽屉并发送消息', async () => {
    const handleSendMessage = vi.fn().mockResolvedValue(true)
    const mockMessages: WatchPartyChatMessage[] = [
      {
        id: 'msg-1',
        senderId: 'user-1',
        senderName: '张三',
        text: '第一条弹幕！',
        timestamp: Date.now(),
      },
    ]

    await act(async () => {
      root.render(
        createElement(WatchPartyChatOverlay, {
          playerOverlayContainer: null,
          messages: mockMessages,
          onSendMessage: handleSendMessage,
          danmakuEnabled: true,
          onToggleDanmaku: vi.fn(),
          participantCount: 3,
        }),
      )
    })

    // Click chat button to open drawer
    const chatBtn = host.querySelector('button[aria-label="放映室聊天"]') as HTMLButtonElement
    expect(chatBtn).not.toBeNull()

    await act(async () => {
      chatBtn.click()
    })

    // Header should show 3人在线
    expect(host.textContent).toContain('3人在线')
    expect(host.textContent).toContain('第一条弹幕！')

    // Find input and send a new message
    const input = host.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()

    await act(async () => {
      setInputValue(input, '太精彩了')
    })

    const sendBtn = host.querySelector('button[aria-label="发送消息"]') as HTMLButtonElement
    await act(async () => {
      sendBtn.click()
    })

    expect(handleSendMessage).toHaveBeenCalledWith('太精彩了')
  })

  it('点击快捷反应 emoji 可直接发送', async () => {
    const handleSendMessage = vi.fn().mockResolvedValue(true)

    await act(async () => {
      root.render(
        createElement(WatchPartyChatOverlay, {
          playerOverlayContainer: null,
          messages: [],
          onSendMessage: handleSendMessage,
          danmakuEnabled: true,
          onToggleDanmaku: vi.fn(),
        }),
      )
    })

    // Open drawer
    const chatBtn = host.querySelector('button[aria-label="放映室聊天"]') as HTMLButtonElement
    await act(async () => {
      chatBtn.click()
    })

    // Click popcorn emoji reaction
    const popcornBtn = host.querySelector('button[title="爆米花"]') as HTMLButtonElement
    expect(popcornBtn).not.toBeNull()

    await act(async () => {
      popcornBtn.click()
    })

    expect(handleSendMessage).toHaveBeenCalledWith('🍿')
  })

  it('关闭弹幕期间的消息不会在重新开启时补播', async () => {
    const props = { playerOverlayContainer: null, onSendMessage: vi.fn().mockResolvedValue(true), onToggleDanmaku: vi.fn() }
    await act(async () => root.render(createElement(WatchPartyChatOverlay, { ...props, messages: [], danmakuEnabled: false })))
    const messages = [{ id: 'hidden', senderId: 'guest', senderName: '访客', text: '关闭期间', timestamp: 1 }]
    await act(async () => root.render(createElement(WatchPartyChatOverlay, { ...props, messages, danmakuEnabled: false })))
    await act(async () => root.render(createElement(WatchPartyChatOverlay, { ...props, messages, danmakuEnabled: true })))
    expect(host.querySelector('.animate-party-danmaku')).toBeNull()
  })

  it('播放时跟随播放器控件隐藏，暂停或打开聊天时保持可见', async () => {
    const player = document.createElement('div')
    const video = document.createElement('video')
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    player.appendChild(video)
    document.body.appendChild(player)
    const props = { playerOverlayContainer: player, messages: [], onSendMessage: vi.fn().mockResolvedValue(true), danmakuEnabled: true, onToggleDanmaku: vi.fn(), isPlaying: true }
    try {
      await act(async () => root.render(createElement(WatchPartyChatOverlay, props)))
      const controls = player.querySelector('[data-party-controls]')!
      expect(controls.getAttribute('aria-hidden')).toBe('true')
      await act(async () => { player.classList.add('art-control-show'); await Promise.resolve() })
      expect(controls.getAttribute('aria-hidden')).toBe('false')
      await act(async () => { (player.querySelector('[aria-label="放映室聊天"]') as HTMLButtonElement).click() })
      await act(async () => { player.classList.remove('art-control-show'); await Promise.resolve() })
      expect(controls.getAttribute('aria-hidden')).toBe('false')
      await act(async () => { (player.querySelector('[aria-label="关闭聊天面板"]') as HTMLButtonElement).click() })
      expect(controls.getAttribute('aria-hidden')).toBe('true')
      Object.defineProperty(video, 'paused', { configurable: true, value: true })
      await act(async () => video.dispatchEvent(new Event('pause')))
      expect(controls.getAttribute('aria-hidden')).toBe('false')
    } finally { player.remove() }
  })

  it('只计未读的他人消息，打开聊天后清零', async () => {
    const props = { playerOverlayContainer: null, onSendMessage: vi.fn().mockResolvedValue(true), danmakuEnabled: true, onToggleDanmaku: vi.fn(), currentUserId: 'self' }
    const makeMessage = (id: string, senderId: string) => ({ id, senderId, senderName: '用户', text: id, timestamp: 1 })
    await act(async () => root.render(createElement(WatchPartyChatOverlay, { ...props, messages: [] })))
    await act(async () => root.render(createElement(WatchPartyChatOverlay, { ...props, messages: [makeMessage('own', 'self'), makeMessage('new', 'other')] })))
    expect(host.querySelector('[data-unread-count]')?.textContent).toBe('1')
    await act(async () => (host.querySelector('[aria-label="放映室聊天"]') as HTMLButtonElement).click())
    expect(host.querySelector('[data-unread-count]')).toBeNull()
  })

  it('发送失败时显示提示并保留输入，重试成功后清空', async () => {
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    await act(async () => root.render(createElement(WatchPartyInlineBar, {
      onSendMessage: send, danmakuEnabled: true, onToggleDanmaku: vi.fn(), messagesCount: 0,
    })))
    const input = host.querySelector('input') as HTMLInputElement
    await act(async () => setInputValue(input, '重试内容'))
    const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes('发送'))!
    await act(async () => button.click())
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('发送失败')
    expect(input.value).toBe('重试内容')
    await act(async () => button.click())
    expect(input.value).toBe('')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
})

describe('WatchPartyInlineBar', () => {
  let host: HTMLElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('支持快速输入吐槽和快捷表情发送', async () => {
    const handleSendMessage = vi.fn().mockResolvedValue(true)
    const handleToggleDanmaku = vi.fn()

    await act(async () => {
      root.render(
        createElement(WatchPartyInlineBar, {
          onSendMessage: handleSendMessage,
          danmakuEnabled: true,
          onToggleDanmaku: handleToggleDanmaku,
          messagesCount: 5,
        }),
      )
    })

    const input = host.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()

    await act(async () => {
      setInputValue(input, '快捷输入内容')
    })

    const sendBtn = Array.from(host.querySelectorAll('button')).find(
      btn => btn.textContent?.includes('发送'),
    ) as HTMLButtonElement

    await act(async () => {
      sendBtn.click()
    })

    expect(handleSendMessage).toHaveBeenCalledWith('快捷输入内容')
  })
})
