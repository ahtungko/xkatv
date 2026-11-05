import { expect, it, vi } from 'vitest'
import { openCastSession } from './tvCastSession'
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/sync/client', () => ({ syncClient: { rpc } }))
vi.mock('@/shared/store/authStore', () => ({
  useAuthStore: { getState: () => ({ session: null }) },
}))
it('pauses background polling and resumes without treating suspended requests as disconnection', async () => {
  vi.useFakeTimers()
  let hidden = false
  const spy = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  let reject: (reason: Error) => void = () => {}
  rpc.mockReturnValueOnce({
    abortSignal: () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  })
  rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: [], error: null }) })
  const error = vi.fn()
  const connection = openCastSession({ id: 'id', pin: '1234', token: 'token' }, vi.fn(), error)
  try {
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    reject(new Error('suspended'))
    await vi.advanceTimersByTimeAsync(60000)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(1)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(error).not.toHaveBeenCalled()
  } finally {
    connection.stop()
    spy.mockRestore()
    vi.useRealTimers()
  }
})
