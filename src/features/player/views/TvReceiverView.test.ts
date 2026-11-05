import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import TvReceiverView from './TvReceiverView'
import { useSettingStore } from '@/shared/store/settingStore'
import { useAuthStore } from '@/shared/store/authStore'
import { initTvCastSettingSync } from '../services/tvCastSettingService'
import { castRpc } from '../lib/tvCastSession'

vi.mock('react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    createElement('a', { href: to }, children),
}))

vi.mock('../services/tvCastSettingService', () => ({
  initTvCastSettingSync: vi.fn(() => vi.fn()),
  setGlobalTvCastEnabled: vi.fn(),
}))

vi.mock('../lib/tvCastSession', () => ({
  castRpc: vi.fn().mockResolvedValue({ id: 's1', token: 't1', pin: '1234' }),
  openCastSession: vi.fn(() => ({
    send: vi.fn(),
    close: vi.fn(),
  })),
  mediaIdentity: vi.fn(m => `${m?.url}`),
}))

vi.mock('@/shared/sync/client', () => ({
  syncClient: {
    channel: vi.fn(),
  },
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
  },
}))

describe('TvReceiverView', () => {
  const originalSystem = useSettingStore.getState().system
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    useSettingStore.setState({
      system: {
        ...originalSystem,
        isTvCastEnabled: true,
      },
    })
    useAuthStore.setState({
      account: null,
      session: null,
      initialized: true,
      error: null,
    })
  })

  afterEach(() => {
    container.remove()
    useSettingStore.setState({ system: originalSystem })
    vi.restoreAllMocks()
  })

  it('在挂载时初始化投屏设置同步 (initTvCastSettingSync)', async () => {
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(TvReceiverView))
    })

    expect(initTvCastSettingSync).toHaveBeenCalled()

    root.unmount()
  })

  it('当投屏功能关闭且非管理员时，显示大屏投屏暂未开放，并不发起配对 RPC', async () => {
    useSettingStore.setState({
      system: {
        ...originalSystem,
        isTvCastEnabled: false,
      },
    })
    const rpcSpy = vi.mocked(castRpc)
    rpcSpy.mockClear()

    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(TvReceiverView))
    })

    expect(container.textContent).toContain('大屏投屏暂未开放')
    expect(rpcSpy).not.toHaveBeenCalled()

    root.unmount()
  })

  it('当投屏功能对全员关闭但管理员登录时，允许大屏预览并显示管理员横幅', async () => {
    useSettingStore.setState({
      system: {
        ...originalSystem,
        isTvCastEnabled: false,
      },
    })
    useAuthStore.setState({
      account: {
        id: 'admin-id',
        username: 'admin',
        role: 'admin',
        enabled: true,
        allow_nsfw: true,
        devices: [],
        created_at: new Date().toISOString(),
      },
      session: null,
      initialized: true,
      error: null,
    })

    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(TvReceiverView))
    })

    expect(container.textContent).toContain('全站大屏投屏当前已对普通用户关闭（仅管理员可见预览）')
    expect(container.textContent).toContain('xkaTV 大屏接收端')

    root.unmount()
  })
})
