import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/shared/store/authStore'
import { useSettingStore } from '@/shared/store/settingStore'
import LiveView from './LiveView'
import * as liveSettingService from '../services/liveSettingService'

vi.mock('../components/LivePlayer', () => ({
  LivePlayer: () => createElement('div', { 'data-testid': 'mock-live-player' }, 'Player'),
}))

describe('LiveView 访问控制与全站开关', () => {
  const originalSystemSettings = useSettingStore.getState().system
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    useSettingStore.setState({ system: originalSystemSettings })
    useAuthStore.setState({ account: null, session: null })
    vi.restoreAllMocks()
  })

  it('直播关闭且非管理员访问时，显示友好不可用页面并提供返回首页按钮', async () => {
    useSettingStore.setState({
      system: { ...originalSystemSettings, isLiveStreamEnabled: false },
    })
    useAuthStore.setState({
      account: {
        id: 'user-1',
        username: 'user1',
        role: 'user',
        enabled: true,
        allow_nsfw: false,
        devices: [],
        created_at: new Date().toISOString(),
      },
    })

    await act(async () => {
      root.render(createElement(MemoryRouter, null, createElement(LiveView)))
    })

    expect(host.textContent).toContain('电视直播暂未开放')
    expect(host.textContent).toContain('返回首页')
    expect(host.querySelector('a[href="/"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="mock-live-player"]')).toBeNull()
  })

  it('直播关闭但管理员访问时，显示管理提示横幅、仅管理员可见徽标及全站开关', async () => {
    useSettingStore.setState({
      system: { ...originalSystemSettings, isLiveStreamEnabled: false },
    })
    useAuthStore.setState({
      account: {
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
        enabled: true,
        allow_nsfw: true,
        devices: [],
        created_at: new Date().toISOString(),
      },
    })

    await act(async () => {
      root.render(createElement(MemoryRouter, null, createElement(LiveView)))
    })

    expect(host.textContent).toContain('全站电视直播当前已对普通用户关闭（仅管理员可见预览）')
    expect(host.textContent).toContain('仅管理员可见')
    expect(host.textContent).toContain('一键对全员开放')
    expect(host.querySelector('button[aria-label="全站电视直播开关"]')).not.toBeNull()
  })

  it('管理员点击一键对全员开放时，触发 setGlobalLiveStreamEnabled(true)', async () => {
    const setGlobalSpy = vi.spyOn(liveSettingService, 'setGlobalLiveStreamEnabled').mockResolvedValue()

    useSettingStore.setState({
      system: { ...originalSystemSettings, isLiveStreamEnabled: false },
    })
    useAuthStore.setState({
      account: {
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
        enabled: true,
        allow_nsfw: true,
        devices: [],
        created_at: new Date().toISOString(),
      },
    })

    await act(async () => {
      root.render(createElement(MemoryRouter, null, createElement(LiveView)))
    })

    const openButton = Array.from(host.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('一键对全员开放'),
    )
    expect(openButton).toBeDefined()

    await act(async () => {
      openButton?.click()
    })

    expect(setGlobalSpy).toHaveBeenCalledWith(true)
  })
})
