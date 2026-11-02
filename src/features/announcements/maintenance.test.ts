import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  rpc: vi.fn(),
  result: vi.fn(),
  env: {} as Record<string, string>,
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.create }))
vi.mock('@/shared/sync/client', () => ({ syncClient: null }))
vi.mock('@/shared/config/runtimeEnv', () => ({ getPublicEnv: (key: string) => mocks.env[key] }))

beforeEach(() => {
  vi.resetModules()
  mocks.env = {
    XKA_SUPABASE_URL: 'https://test.supabase.co',
    XKA_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  }
  mocks.create.mockReset().mockReturnValue({ rpc: mocks.rpc })
  mocks.rpc.mockReset().mockReturnValue({ abortSignal: mocks.result })
  mocks.result.mockReset().mockResolvedValue({
    data: { server_time: '2026-10-25T08:00:00Z', maintenance: null },
    error: null,
  })
})

it('公开维护查询使用不持久化的独立匿名客户端，不依赖当前登录状态', async () => {
  const { readPublicMaintenance } = await import('./maintenance')
  const signal = new AbortController().signal
  expect(await readPublicMaintenance(signal)).toMatchObject({ maintenance: null })
  expect(mocks.create).toHaveBeenCalledWith(
    'https://test.supabase.co',
    'sb_publishable_test',
    expect.objectContaining({
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'xkatv-public-maintenance',
      },
    }),
  )
  expect(mocks.rpc).toHaveBeenCalledWith('get_public_site_maintenance_status')
  expect(mocks.result).toHaveBeenCalledWith(signal)
  await readPublicMaintenance(signal)
  expect(mocks.create).toHaveBeenCalledTimes(1)
})

it('公开配置缺失或接口失败时不假装维护已结束', async () => {
  mocks.env = {}
  const { readPublicMaintenance } = await import('./maintenance')
  const signal = new AbortController().signal
  await expect(readPublicMaintenance(signal)).rejects.toThrow('暂时无法确认网站状态')
  expect(mocks.create).not.toHaveBeenCalled()
  mocks.env = { XKA_SUPABASE_URL: 'https://test.supabase.co', XKA_SUPABASE_ANON_KEY: 'legacy-anon' }
  mocks.result.mockResolvedValueOnce({ data: null, error: { message: 'private diagnostic' } })
  await expect(readPublicMaintenance(signal)).rejects.toThrow('暂时无法确认网站状态')
})
