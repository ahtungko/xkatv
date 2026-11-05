import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
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
it('waits for TV consent and ignores progress-driven rerenders', async () => {
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
  const root = createRoot(document.createElement('div'))
  try {
    await act(async () => root.render(createElement(Harness)))
    await act(async () => api.connectAndCast('1234'))
    expect(pause).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    await act(async () =>
      mocks.handler({ type: 'connect_ack', deviceName: 'TV', isPlaying: false }),
    )
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(pause).toHaveBeenCalledTimes(1)
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
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})

it('times out without pausing the local player when the TV never confirms', async () => {
 vi.useFakeTimers()
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
 mocks.send.mockClear(); mocks.close.mockClear()
 const pause=vi.fn()
 let api: ReturnType<typeof useTvCast>
 function Harness() { api=useTvCast({currentMedia:{videoUrl:'https://test/a.m3u8',mediaTitle:'A',episodeTitle:'1',episodeIndex:0,initialTime:0},onPauseLocalPlayer:pause}); return null }
 const root=createRoot(document.createElement('div'))
 try {
  await act(async()=>root.render(createElement(Harness)))
  await act(async()=>api.connectAndCast('1234'))
  await act(async()=>vi.advanceTimersByTimeAsync(30001))
  expect(pause).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
  expect(mocks.close).toHaveBeenCalled()
 } finally { await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals() }
})
