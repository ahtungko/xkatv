import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/shared/store/authStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import Navigation from './Navigation'
import MobileTabBar from './MobileTabBar'
import { SidebarProvider } from './ui/sidebar'

describe('直播功能开关对导航菜单的全局影响', () => {
  const originalSystemSettings = useSettingStore.getState().system
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    window.matchMedia = window.matchMedia || (() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
    usePrivateModeStore.getState().setPrivateMode(false)
    host = document.createElement('div')
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    useSettingStore.setState({ system: originalSystemSettings })
    useAuthStore.setState({ account: null, session: null })
  })

  it('当直播开启时，普通用户与管理员均能看到直播导航入口', async () => {
    useSettingStore.setState({
      system: { ...originalSystemSettings, isLiveStreamEnabled: true },
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
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(SidebarProvider, null, createElement(Navigation), createElement(MobileTabBar)),
        ),
      )
    })

    expect(host.textContent).toContain('直播')
  })

  it('当直播关闭时，普通用户在导航栏与底栏中均看不到直播入口', async () => {
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
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(SidebarProvider, null, createElement(Navigation), createElement(MobileTabBar)),
        ),
      )
    })

    expect(host.textContent).not.toContain('直播')
  })

  it('当直播关闭时，管理员仍可看到直播入口以便测试和管理', async () => {
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
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(SidebarProvider, null, createElement(Navigation), createElement(MobileTabBar)),
        ),
      )
    })

    expect(host.textContent).toContain('直播')
  })
})
