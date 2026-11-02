import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { expect, it } from 'vitest'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import MobileTabBar from './MobileTabBar'

it('隐藏无痕入口并可在播放页与首页之间导航', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  usePrivateModeStore.getState().setPrivateMode(false)
  const host = document.createElement('div')
  const root = createRoot(host)
  let navigate!: ReturnType<typeof useNavigate>
  function App() {
    navigate = useNavigate()
    return createElement(MobileTabBar)
  }
  await act(async () => root.render(createElement(MemoryRouter, null,
    createElement(Routes, null, createElement(Route, { path: '*', element: createElement(App) })),
  )))
  expect(host.textContent).toContain('追剧')
  expect(host.textContent).toContain('历史')
  await act(async () => usePrivateModeStore.getState().setPrivateMode(true))
  expect(host.textContent).not.toContain('追剧')
  expect(host.textContent).not.toContain('历史')
  await act(async () => navigate('/play/cms/source/id'))
  expect(host.querySelector('nav')).toBeNull()
  await act(async () => navigate('/'))
  expect(host.textContent).toContain('首页')
  await act(async () => usePrivateModeStore.getState().setPrivateMode(false))
  expect(host.textContent).toContain('追剧')
  expect(host.textContent).toContain('历史')
  await act(async () => root.unmount())
})
