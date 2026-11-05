import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import TvPairView from './TvPairView'
import { useSettingStore } from '@/shared/store/settingStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useTvCastStore } from '../store/tvCastStore'

const mockNavigate = vi.fn()
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    createElement('a', { href: to }, children),
}))

describe('TvPairView', () => {
  const originalSystem = useSettingStore.getState().system
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    sessionStorage.clear()
    mockNavigate.mockReset()
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
    useTvCastStore.setState({
      status: 'idle',
      pin: '',
      error: '',
    })
  })

  afterEach(() => {
    container.remove()
    sessionStorage.clear()
    useSettingStore.setState({ system: originalSystem })
    vi.restoreAllMocks()
  })

  it('当功能对普通用户关闭时，展示关闭界面，清除 tv_cast_intent 且不建立连接', async () => {
    useSettingStore.setState({
      system: {
        ...originalSystem,
        isTvCastEnabled: false,
      },
    })
    sessionStorage.setItem('tv_cast_intent', JSON.stringify({ pin: '8888', time: Date.now() }))
    const connectSpy = vi.spyOn(useTvCastStore.getState(), 'connect')

    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(TvPairView))
    })

    expect(container.textContent).toContain('大屏投屏暂未开放')
    expect(sessionStorage.getItem('tv_cast_intent')).toBeNull()
    expect(connectSpy).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()

    root.unmount()
  })

  it('当功能开启且存在有效 tv_cast_intent 时，自动触发连接并跳转首页', async () => {
    useSettingStore.setState({
      system: {
        ...originalSystem,
        isTvCastEnabled: true,
      },
    })
    sessionStorage.setItem('tv_cast_intent', JSON.stringify({ pin: '6666', time: Date.now() }))
    const connectSpy = vi.spyOn(useTvCastStore.getState(), 'connect').mockResolvedValue(undefined)

    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(TvPairView))
    })

    expect(connectSpy).toHaveBeenCalledWith('6666')
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    expect(sessionStorage.getItem('tv_cast_intent')).toBeNull()

    root.unmount()
  })

  it('当功能对普通用户关闭但管理员登录时，允许管理员预览并显示管理员提示横幅', async () => {
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
      root.render(createElement(TvPairView))
    })

    expect(container.textContent).toContain('全站大屏投屏当前已对普通用户关闭（仅管理员可见预览）')
    expect(container.textContent).toContain('连接电视')

    root.unmount()
  })
})
