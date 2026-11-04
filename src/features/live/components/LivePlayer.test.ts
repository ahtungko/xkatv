/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-function-type */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { LivePlayer } from './LivePlayer'

const mocks = vi.hoisted(() => ({
  options: [] as Record<string, any>[],
  listeners: [] as Function[],
  destroyed: vi.fn(),
  native: false,
}))
vi.mock('artplayer', () => ({
  default: class {
    constructor(options: Record<string, any>) {
      mocks.options.push(options)
    }
    on() {}
    destroy() {}
  },
}))
vi.mock('hls.js', () => ({
  default: class {
    static isSupported() {
      return !mocks.native
    }
    static DefaultConfig = { loader: class {} }
    static Events = { ERROR: 'error' }
    static ErrorTypes = { NETWORK_ERROR: 'network', MEDIA_ERROR: 'media' }
    loadSource() {}
    attachMedia() {}
    on(_event: string, listener: Function) {
      mocks.listeners.push(listener)
    }
    destroy = mocks.destroyed
  },
}))
const container = document.createElement('div')
let root: ReturnType<typeof createRoot>
afterEach(async () => {
  await act(async () => root.unmount())
  mocks.options.length = 0
  mocks.listeners.length = 0
  mocks.native = false
  vi.unstubAllGlobals()
})
async function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  root = createRoot(container)
  await act(async () =>
    root.render(
      createElement(LivePlayer, {
        channel: { id: '1', name: 'Live', group: '', url: 'http://origin.test/live.m3u8' },
      }),
    ),
  )
}
it('exposes retry after a fatal manifest failure and recreates the player', async () => {
  await mount()
  mocks.options[0].customType.m3u8(
    document.createElement('video'),
    'http://origin.test/live.m3u8',
    { on() {} },
  )
  await act(async () => mocks.listeners[0]('error', { fatal: true, type: 'network' }))
  expect(container.textContent).toContain('重试连接')
  await act(async () => container.querySelector('button')!.click())
  expect(mocks.options).toHaveLength(2)
  expect(container.textContent).not.toContain('重试连接')
})
it('requests recursive proxy rewriting for native HLS', async () => {
  mocks.native = true
  await mount()
  const video = { canPlayType: () => 'probably', src: '' }
  mocks.options[0].customType.m3u8(video, 'http://origin.test/live.m3u8', {})
  const url = new URL(video.src)
  expect(url.searchParams.get('native')).toBe('1')
  expect(url.searchParams.get('url')).toBe('http://origin.test/live.m3u8')
})
