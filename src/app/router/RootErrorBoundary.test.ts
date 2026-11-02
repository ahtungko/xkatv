import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  error: null as unknown,
  isResponse: false,
}))

vi.mock('react-router', () => ({
  useRouteError: () => mocks.error,
  isRouteErrorResponse: (err: unknown) =>
    Boolean(
      err &&
        typeof err === 'object' &&
        'status' in err &&
        mocks.isResponse,
    ),
}))

import { RootErrorBoundary, type RootErrorBoundaryProps } from './RootErrorBoundary'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.error = null
  mocks.isResponse = false
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('RootErrorBoundary', () => {
  it('捕获动态分包加载失败时，提示网站更新并仅引导刷新', async () => {
    mocks.error = new TypeError(
      'Failed to fetch dynamically imported module: https://tv.vyxolabs.com/assets/HomeView-B0vPL-0X.js',
    )
    await act(async () => root.render(createElement(RootErrorBoundary)))

    expect(host.textContent).toContain('网站已发布新版本')
    expect(host.textContent).toContain('检测到应用更新或静态分包失效')
    expect(host.textContent).toContain('刷新页面')
    expect(host.textContent).not.toContain('返回首页')
    expect(host.querySelector('details')).toBeNull()
  })

  it('捕获 404 路由错误时，提示页面未找到并提供返回首页', async () => {
    mocks.error = { status: 404, statusText: 'Not Found' }
    mocks.isResponse = true
    await act(async () => root.render(createElement(RootErrorBoundary)))

    expect(host.textContent).toContain('页面未找到')
    expect(host.textContent).toContain('你访问的页面不存在或已被移除')
    expect(host.textContent).toContain('返回首页')
    expect(host.textContent).toContain('刷新页面')
  })

  it('捕获通用渲染异常时，展示排查说明与技术错误折叠区', async () => {
    mocks.error = new Error('Database connection failed')
    await act(async () => root.render(createElement(RootErrorBoundary)))

    expect(host.textContent).toContain('页面遇到意外问题')
    expect(host.textContent).toContain('查看技术错误详情')
    expect(host.textContent).toContain('Database connection failed')
    expect(host.textContent).toContain('返回首页')
    expect(host.textContent).toContain('刷新页面')
  })

  it('优先使用 props.error 进行展示（用于外层 ErrorBoundary）', async () => {
    mocks.error = null
    await act(async () =>
      root.render(
        createElement<RootErrorBoundaryProps>(RootErrorBoundary, {
          error: new TypeError('Failed to fetch dynamically imported module'),
        }),
      ),
    )

    expect(host.textContent).toContain('网站已发布新版本')
    expect(host.textContent).toContain('刷新页面')
  })

  it('点击刷新页面按钮调用 onReload 回调', async () => {
    const onReload = vi.fn()
    mocks.error = new TypeError('Failed to fetch dynamically imported module')
    await act(async () =>
      root.render(createElement<RootErrorBoundaryProps>(RootErrorBoundary, { onReload })),
    )

    const reloadButton = Array.from(host.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('刷新页面'),
    )
    expect(reloadButton).toBeDefined()
    await act(async () => reloadButton!.click())
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('点击返回首页按钮调用 onGoHome 回调', async () => {
    const onGoHome = vi.fn()
    mocks.error = { status: 404, statusText: 'Not Found' }
    mocks.isResponse = true
    await act(async () =>
      root.render(createElement<RootErrorBoundaryProps>(RootErrorBoundary, { onGoHome })),
    )

    const homeButton = Array.from(host.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('返回首页'),
    )
    expect(homeButton).toBeDefined()
    await act(async () => homeButton!.click())
    expect(onGoHome).toHaveBeenCalledTimes(1)
  })
})
