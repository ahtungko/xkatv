import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useTvCastStore } from '../store/tvCastStore'
import { useTvCast } from './useTvCast'
import type { TvCastMessage } from '../lib/tvCastProtocol'
const mocks = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
  handler: (_msg: TvCastMessage) => {
    void _msg
  },
}))
vi.mock('../lib/tvCastSession', () => ({
  castRpc: vi.fn().mockResolvedValue({ id: 'id', token: 'secret', pin: '1234' }),
  mediaIdentity: (m: { videoUrl: string }) => m.videoUrl,
  openCastSession: (_s: unknown, handler: typeof mocks.handler) => {
    mocks.handler = handler
    return { send: mocks.send, close: mocks.close }
  },
}))
afterEach(() => {
  useTvCastStore.getState().disconnect()
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('pairs without media, automatically casts selection, and survives leaving the player', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const pause = vi.fn()
  let api: ReturnType<typeof useTvCast>
  function Harness() {
    api = useTvCast({
      currentMedia: {
        videoUrl: 'https://test/a.m3u8',
        mediaTitle: 'A',
        episodeTitle: '1',
        episodeIndex: 0,
        initialTime: 0,
      },
      onPauseLocalPlayer: () => pause(),
    })
    return null
  }
  // Pair from the global page before there is a player.
  await useTvCastStore.getState().connect('1234')
  mocks.handler({ type: 'connect_ack', deviceName: 'TV', isPlaying: false })
  expect(useTvCastStore.getState().status).toBe('connected')
  expect(mocks.send).not.toHaveBeenCalled()
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(createElement(Harness)))
  expect(mocks.send).toHaveBeenCalledTimes(1)
  await act(async () => api.castCurrent())
  expect(pause).toHaveBeenCalledTimes(2)
  expect(mocks.send).toHaveBeenCalledTimes(1)
  await act(async () =>
    mocks.handler({
      type: 'progress',
      payload: {
        isPlaying: true,
        currentTime: 10,
        duration: 100,
        mediaTitle: 'A',
        episodeTitle: '1',
      },
    }),
  )
  expect(mocks.send).toHaveBeenCalledTimes(1)
  await act(async () => root.unmount())
  expect(mocks.close).not.toHaveBeenCalled()
  expect(useTvCastStore.getState().status).toBe('connected')
})
it('times out unconfirmed requests without sending media', async () => {
  vi.useFakeTimers()
  await useTvCastStore.getState().connect('1234')
  await vi.advanceTimersByTimeAsync(30001)
  expect(useTvCastStore.getState().status).toBe('idle')
  expect(mocks.send).not.toHaveBeenCalled()
  expect(mocks.close).toHaveBeenCalled()
})
it('preserves an accepted session during screen lock and grants foreground recovery time', async () => {
  vi.useFakeTimers()
  let hidden = false
  const spy = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  try {
    await useTvCastStore.getState().connect('1234')
    mocks.handler({ type: 'connect_ack', deviceName: 'TV', isPlaying: false })
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(120000)
    expect(useTvCastStore.getState().status).toBe('connected')
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(3000)
    expect(useTvCastStore.getState().status).toBe('connected')
    mocks.handler({
      type: 'progress',
      payload: {
        isPlaying: true,
        currentTime: 120,
        duration: 1000,
        mediaTitle: 'A',
        episodeTitle: '1',
      },
    })
    expect(mocks.close).not.toHaveBeenCalled()
  } finally {
    spy.mockRestore()
  }
})

it('requires confirmation to replace even paused media and cancels without sending', async () => {
  await useTvCastStore.getState().connect('1234')
  mocks.handler({ type: 'connect_ack', deviceName: 'TV', isPlaying: false })
  const media = {
    videoUrl: 'https://test/a',
    mediaTitle: 'A',
    episodeTitle: '1',
    episodeIndex: 0,
    initialTime: 0,
  }
  await useTvCastStore.getState().requestMedia(media)
  const replacement = { ...media, videoUrl: 'https://test/b', mediaTitle: 'B' }
  const cancelled = useTvCastStore.getState().requestMedia(replacement)
  expect(mocks.send).toHaveBeenCalledTimes(1)
  useTvCastStore.getState().resolveSwitch(false)
  expect(await cancelled).toBe(false)
  const confirmed = useTvCastStore.getState().requestMedia(replacement)
  useTvCastStore.getState().resolveSwitch(true)
  expect(await confirmed).toBe(true)
  expect(mocks.send).toHaveBeenCalledTimes(2)
})
