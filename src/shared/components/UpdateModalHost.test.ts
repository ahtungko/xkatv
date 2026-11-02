import { act, createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useVersionStore } from '@/shared/store/versionStore'

const lifecycle = vi.hoisted(() => ({ load: vi.fn(), mount: vi.fn(), unmount: vi.fn() }))
vi.mock('./UpdateModal', () => {
  lifecycle.load()
  return {
    default: function Modal() {
      const open = useVersionStore(state => state.showUpdateModal)
      useEffect(() => {
        lifecycle.mount()
        return () => lifecycle.unmount()
      }, [])
      return createElement('div', { 'data-state': open ? 'open' : 'closed' })
    },
  }
})

import UpdateModalHost from './UpdateModalHost'

it('首次打开才下载弹窗，关闭和重新打开时保留组件供退出动画使用', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const previousState = useVersionStore.getState()
  useVersionStore.setState({ showUpdateModal: false })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(UpdateModalHost)))
    expect(lifecycle.load).not.toHaveBeenCalled()
    expect(host.childElementCount).toBe(0)

    await act(async () => useVersionStore.getState().setShowUpdateModal(true))
    expect(lifecycle.load).toHaveBeenCalledTimes(1)
    expect(lifecycle.mount).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-state="open"]')).not.toBeNull()

    await act(async () => useVersionStore.getState().setShowUpdateModal(false))
    expect(host.querySelector('[data-state="closed"]')).not.toBeNull()
    expect(lifecycle.unmount).not.toHaveBeenCalled()

    await act(async () => useVersionStore.getState().setShowUpdateModal(true))
    expect(host.querySelector('[data-state="open"]')).not.toBeNull()
    expect(lifecycle.mount).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
    useVersionStore.setState(previousState)
    host.remove()
  }
  expect(lifecycle.unmount).toHaveBeenCalledTimes(1)
})
