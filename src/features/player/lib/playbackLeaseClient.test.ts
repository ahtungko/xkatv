import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playbackLeaseClient } from './playbackLeaseClient'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  setHeader: vi.fn(),
  abortSignal: vi.fn(),
  state: { account: { id: 'account-a' }, session: { access_token: 'token-a' } },
}))

vi.mock('@/shared/sync/client', () => ({ syncClient: { rpc: mocks.rpc } }))
vi.mock('@/shared/store/authStore', () => ({
  useAuthStore: { getState: () => mocks.state },
}))

beforeEach(() => {
  mocks.state = { account: { id: 'account-a' }, session: { access_token: 'token-a' } }
  mocks.rpc.mockReset()
  mocks.setHeader.mockReset()
  mocks.abortSignal.mockReset()
  mocks.rpc.mockReturnValue({ setHeader: mocks.setHeader })
  mocks.setHeader.mockReturnValue({ abortSignal: mocks.abortSignal })
  mocks.abortSignal.mockResolvedValue({ data: { status: 'lost' }, error: null })
})

describe('playback lease RPC contract', () => {
  it('sends the exact parameter names declared by the SQL migration', async () => {
    const request = playbackLeaseClient('episode-1', 'Example')
    await request({ operation: 'renew', lease: 'lease-1', position: 42, duration: 120 })
    const [name, payload] = mocks.rpc.mock.calls[0]
    const sql = readFileSync('supabase/migrations/202610030001_playback_lease.sql', 'utf8')
    const signature = sql.match(/create function public\.playback_lease\(([\s\S]*?)\)/)?.[1]
    expect(signature).toBeDefined()
    const parameters = signature!.split(',').map(parameter => parameter.trim().split(/\s+/)[0])
    expect(Object.keys(payload).sort()).toEqual(parameters.sort())
    expect(name).toBe('playback_lease')
    expect(payload).toMatchObject({
      p_operation: 'renew',
      p_lease: 'lease-1',
      p_position: 42,
      p_duration: 120,
      p_media_key: 'episode-1',
      p_title: 'Example',
    })
    expect(mocks.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer token-a')
  })

  it('uses a refreshed token and keeps the same player when taking over', async () => {
    const request = playbackLeaseClient('episode-1', 'Example')
    await request({ operation: 'acquire', position: 0, duration: 120 })
    mocks.state.session.access_token = 'refreshed'
    await request({ operation: 'acquire', takeover: 'other-lease', position: 0, duration: 120 })
    expect(mocks.rpc.mock.calls[1][1].p_player).toBe(mocks.rpc.mock.calls[0][1].p_player)
    expect(mocks.rpc.mock.calls[1][1].p_takeover).toBe('other-lease')
    expect(mocks.setHeader).toHaveBeenLastCalledWith('Authorization', 'Bearer refreshed')
  })

  it('rejects requests after switching accounts', async () => {
    const request = playbackLeaseClient('episode-1', 'Example')
    mocks.state.account.id = 'account-b'
    await expect(request({ operation: 'renew', position: 1, duration: 120 })).rejects.toThrow()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('reuses the same player across reloads in the same tab', async () => {
    const request1 = playbackLeaseClient('episode-1', 'Example')
    await request1({ operation: 'acquire', position: 0, duration: 120 })
    const player1 = mocks.rpc.mock.calls[0][1].p_player

    // Simulating page reload in the same tab (sessionStorage preserved)
    const request2 = playbackLeaseClient('episode-1', 'Example')
    await request2({ operation: 'acquire', position: 0, duration: 120 })
    const player2 = mocks.rpc.mock.calls[1][1].p_player

    expect(player1).toBe(player2)
  })
})

describe('private playback lease', () => {
  it('never sends the media identity or progress in private mode (boolean or function)', async () => {
    const request = playbackLeaseClient('secret-media', 'secret-title', true)
    for (const operation of ['acquire', 'renew', 'release'] as const) {
      await request({ operation, position: 123, duration: 456 })
      const payload = mocks.rpc.mock.lastCall?.[1]
      expect(payload.p_media_key).toMatch(/^private:/)
      expect(payload.p_media_key).not.toContain('secret-media')
      expect(payload.p_title).toBe('无痕播放')
      expect(payload.p_position).toBe(0)
      expect(payload.p_duration).toBe(0)
    }

    // Dynamic getter function test
    let dynamicPrivate = false
    const dynamicRequest = playbackLeaseClient('secret-media', 'secret-title', () => dynamicPrivate)

    await dynamicRequest({ operation: 'renew', position: 50, duration: 100 })
    expect(mocks.rpc.mock.lastCall?.[1].p_media_key).toBe('secret-media')
    expect(mocks.rpc.mock.lastCall?.[1].p_title).toBe('secret-title')
    expect(mocks.rpc.mock.lastCall?.[1].p_position).toBe(50)

    dynamicPrivate = true
    await dynamicRequest({ operation: 'renew', position: 60, duration: 100 })
    expect(mocks.rpc.mock.lastCall?.[1].p_media_key).toMatch(/^private:/)
    expect(mocks.rpc.mock.lastCall?.[1].p_title).toBe('无痕播放')
    expect(mocks.rpc.mock.lastCall?.[1].p_position).toBe(0)
  })
})


describe('lease identity confirmation', () => {
  it('waits for the server to confirm each mode transition', async () => {
    let privateMode = false
    const request = playbackLeaseClient('episode', 'Title', () => privateMode)
    mocks.abortSignal.mockResolvedValueOnce({ data: { status: 'held', lease_id: '20000000-0000-4000-8000-000000000001', ttl_ms: 30000, media_key: 'episode' }, error: null })
    await request({ operation: 'acquire', position: 1, duration: 10 })
    expect(request.isIdentityConfirmed()).toBe(true)
    privateMode = true
    request.invalidateIdentity()
    expect(request.isIdentityConfirmed()).toBe(false)
    mocks.abortSignal.mockImplementationOnce(async () => ({ data: { status: 'held', lease_id: '20000000-0000-4000-8000-000000000001', ttl_ms: 30000, media_key: mocks.rpc.mock.lastCall![1].p_media_key }, error: null }))
    await request({ operation: 'renew', position: 2, duration: 10 })
    expect(request.isIdentityConfirmed()).toBe(true)
    privateMode = false
    request.invalidateIdentity()
    mocks.abortSignal.mockResolvedValueOnce({ data: { status: 'held', lease_id: '20000000-0000-4000-8000-000000000001', ttl_ms: 30000 }, error: null })
    await request({ operation: 'renew', position: 3, duration: 10 })
    expect(request.isIdentityConfirmed()).toBe(false)
  })
})
