import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ authenticated: false, loadRoutes: vi.fn() }))
vi.mock('@/shared/components/AuthGuard', () => ({
  default: ({ children }: { children: ReactNode }) =>
    state.authenticated ? children : createElement('p', null, '请登录'),
}))
vi.mock('./routes', () => {
  state.loadRoutes()
  return { default: () => createElement('p', null, '已登录页面') }
})

import AppRouter from './index'

it('登录成功后才加载应用路由，退出后重新显示登录页', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(AppRouter)))
    expect(host.textContent).toContain('请登录')
    expect(state.loadRoutes).not.toHaveBeenCalled()

    state.authenticated = true
    await act(async () => root.render(createElement(AppRouter)))
    expect(state.loadRoutes).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('已登录页面')

    state.authenticated = false
    await act(async () => root.render(createElement(AppRouter)))
    expect(host.textContent).toContain('请登录')
    expect(host.textContent).not.toContain('已登录页面')
  } finally {
    state.authenticated = false
    await act(async () => root.unmount())
    host.remove()
  }
})
