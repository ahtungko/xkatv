// @vitest-environment jsdom
import { act, createElement } from 'react'

// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { GlobalWatchPartyPill } from './GlobalWatchPartyPill'
import {
  useWatchPartyStore,
  resetWatchPartyStore,
} from '../store/watchPartyStore'

const mockLocation = vi.hoisted(() => ({ pathname: '/' }))
const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('react-router', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}))

describe('GlobalWatchPartyPill', () => {
  let host: HTMLElement
  let root: Root

  beforeEach(() => {
    resetWatchPartyStore()
    vi.clearAllMocks()
    mockLocation.pathname = '/'
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('没有激活放映室时不渲染任何悬浮组件', async () => {
    await act(async () => {
      root.render(createElement(GlobalWatchPartyPill))
    })

    expect(host.innerHTML).toBe('')
  })

  it('激活放映室且在非播放页时渲染悬浮胶囊', async () => {
    act(() => {
      useWatchPartyStore.setState({
        isPartyActive: true,
        isHost: true,
        roomId: 'test-room',
        participantCount: 3,
        isSelectingMedia: true,
      })
    })

    await act(async () => {
      root.render(createElement(GlobalWatchPartyPill))
    })

    expect(host.textContent).toContain('放映室进行中')
    expect(host.textContent).toContain('3人')
    expect(host.textContent).toContain('选片中')
  })

  it('点击展开控制台，展示房间信息、邀请链接与返回放映按钮', async () => {
    act(() => {
      useWatchPartyStore.setState({
        isPartyActive: true,
        isHost: true,
        roomId: 'test-room-888',
        participantCount: 2,
        currentMedia: {
          mediaTitle: '星际穿越',
          episodeTitle: '正片',
          playPath: '/play/source-1/interstellar',
        },
        isSelectingMedia: false,
        inviteUrl: 'https://example.com/p/test-room-888',
      })
    })

    await act(async () => {
      root.render(createElement(GlobalWatchPartyPill))
    })

    // Click pill to expand
    const pill = host.querySelector('[role="button"]') as HTMLElement
    expect(pill).not.toBeNull()

    await act(async () => {
      pill.click()
    })

    expect(host.textContent).toContain('放映厅控制台')
    expect(host.textContent).toContain('《星际穿越》')
    expect(host.textContent).toContain('邀请好友')

    // Click "回到放映"
    const returnBtn = Array.from(host.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('回到放映'),
    ) as HTMLButtonElement
    expect(returnBtn).not.toBeNull()

    await act(async () => {
      returnBtn.click()
    })

    expect(mockNavigate).toHaveBeenCalledWith('/play/source-1/interstellar')
  })

  it('在非播放页面点击互动吐槽后直接打开聊天面板', async () => {
    useWatchPartyStore.setState({ isPartyActive: true, isHost: true, roomId: 'room123' })
    await act(async () => root.render(createElement(GlobalWatchPartyPill)))
    await act(async () => (host.querySelector('[role="button"]') as HTMLElement).click())
    const chatButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('互动吐槽'))!
    await act(async () => chatButton.click())
    expect(host.querySelector('[aria-label="关闭聊天面板"]')).not.toBeNull()
    expect(host.querySelector('input[placeholder="发条弹幕吐槽..."]')).not.toBeNull()
  })
})
