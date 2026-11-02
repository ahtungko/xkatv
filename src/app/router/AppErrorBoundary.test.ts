import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

let host: HTMLDivElement
let root: Root

function ThrowingComponent({ error }: { error: unknown }): ReactNode {
  throw error
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('AppErrorBoundary', () => {
  it('子组件正常时直接渲染子组件内容', async () => {
    await act(async () =>
      root.render(
        createElement(
          AppErrorBoundary,
          null,
          createElement('div', { 'data-testid': 'child' }, '正常页面内容'),
        ),
      ),
    )

    expect(host.textContent).toContain('正常页面内容')
    expect(host.textContent).not.toContain('网站已发布新版本')
  })

  it('捕获外层懒加载分包失败异常，渲染新版本提示界面', async () => {
    const chunkError = new TypeError(
      'Failed to fetch dynamically imported module: https://tv.vyxolabs.com/assets/routes-CERiqEFj.js',
    )
    const onReload = vi.fn()

    await act(async () =>
      root.render(
        createElement(
          AppErrorBoundary,
          { onReload },
          createElement(ThrowingComponent, { error: chunkError }),
        ),
      ),
    )

    expect(host.textContent).toContain('网站已发布新版本')
    expect(host.textContent).toContain('检测到应用更新或静态分包失效')
    expect(host.textContent).toContain('刷新页面')
    expect(host.textContent).not.toContain('返回首页')

    const reloadButton = Array.from(host.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('刷新页面'),
    )
    expect(reloadButton).toBeDefined()
    await act(async () => reloadButton!.click())
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('捕获常规组件崩溃异常，展示意外问题说明与返回首页入口', async () => {
    const renderError = new Error('AuthGuard bootstrap failed unexpectedly')
    const onGoHome = vi.fn()

    await act(async () =>
      root.render(
        createElement(
          AppErrorBoundary,
          { onGoHome },
          createElement(ThrowingComponent, { error: renderError }),
        ),
      ),
    )

    expect(host.textContent).toContain('页面遇到意外问题')
    expect(host.textContent).toContain('查看技术错误详情')
    expect(host.textContent).toContain('AuthGuard bootstrap failed unexpectedly')
    expect(host.textContent).toContain('返回首页')
    expect(host.textContent).toContain('刷新页面')

    const homeButton = Array.from(host.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('返回首页'),
    )
    expect(homeButton).toBeDefined()
    await act(async () => homeButton!.click())
    expect(onGoHome).toHaveBeenCalledTimes(1)
  })

  it('生产环境隐藏原始异常详情，保留通用提示与恢复操作', async () => {
    vi.stubEnv('DEV', false)
    const error = new Error('Internal request failed: https://internal.invalid/?token=test-secret')
    const onReload = vi.fn()
    const onGoHome = vi.fn()

    await act(async () =>
      root.render(
        createElement(
          AppErrorBoundary,
          { onReload, onGoHome },
          createElement(ThrowingComponent, { error }),
        ),
      ),
    )

    expect(host.textContent).toContain('页面遇到意外问题')
    expect(host.textContent).not.toContain(error.message)
    expect(host.textContent).not.toContain('查看技术错误详情')
    expect(host.querySelector('details')).toBeNull()
    expect(host.querySelector('pre')).toBeNull()

    const buttons = Array.from(host.querySelectorAll('button'))
    await act(async () => {
      buttons.find(button => button.textContent?.includes('刷新页面'))!.click()
      buttons.find(button => button.textContent?.includes('返回首页'))!.click()
    })
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(onGoHome).toHaveBeenCalledTimes(1)
  })

  it('支持提供自定义 fallback 函数并在重置时恢复', async () => {
    let shouldThrow = true
    function MaybeThrow() {
      if (shouldThrow) {
        throw new Error('Test crash')
      }
      return createElement('div', null, '已成功恢复')
    }

    let resetFn: (() => void) | null = null

    await act(async () =>
      root.render(
        createElement(
          AppErrorBoundary,
          {
            fallback: (err, reset) => {
              resetFn = reset
              return createElement('div', { 'data-testid': 'custom-fallback' }, `捕获到：${(err as Error).message}`)
            },
          },
          createElement(MaybeThrow),
        ),
      ),
    )

    expect(host.textContent).toContain('捕获到：Test crash')

    shouldThrow = false
    await act(async () => {
      resetFn?.()
    })

    expect(host.textContent).toContain('已成功恢复')
  })
})
