import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountSchema } from '../../../shared/account-rules'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  publicStatus: vi.fn(),
  privateStatus: vi.fn(),
  startAuth: vi.fn(() => () => {}),
  startSync: vi.fn(() => () => {}),
}))
vi.mock('@/shared/store/authStore', async importOriginal => ({
  ...(await importOriginal<typeof import('@/shared/store/authStore')>()),
  startAuth: mocks.startAuth,
}))
vi.mock('@/shared/sync/service', () => ({ startSync: mocks.startSync }))
vi.mock('@/shared/sync/client', () => ({ syncClient: {} }))
vi.mock('@/features/announcements/maintenance', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/announcements/maintenance')>()),
  readPublicMaintenance: mocks.publicStatus,
  readMaintenance: mocks.privateStatus,
}))

import AuthGuard from './AuthGuard'
import { useAuthStore } from '@/shared/store/authStore'

let host: HTMLDivElement
let root: Root
const original = useAuthStore.getInitialState()
const status = () => ({ server_time: new Date().toISOString(), maintenance: null })
const account = (role = 'user') =>
  accountSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    username: 'test',
    role,
    enabled: true,
    created_at: '2026-10-25',
  })
const mount = () =>
  act(async () =>
    root.render(
      createElement(
        AuthGuard,
        null,
        createElement('div', { 'data-testid': 'protected' }, '受保护页面'),
      ),
    ),
  )
async function submit() {
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  window.history.replaceState({}, '', '/')
  mocks.login.mockReset()
  mocks.publicStatus.mockReset().mockImplementation(async () => status())
  mocks.privateStatus.mockReset().mockImplementation(async () => status())
  useAuthStore.setState({ ...original, initialized: true, login: mocks.login }, true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  useAuthStore.setState(original, true)
  window.history.replaceState({}, '', '/')
})

describe('登录前维护与管理入口', () => {
  it.each(['/p/room123', '/party/room123'])('允许未登录访客打开影厅地址 %s', async path => {
    window.history.replaceState({}, '', path)
    await mount()
    expect(host.querySelector('[data-testid="protected"]')).not.toBeNull()
    expect(host.querySelector('form')).toBeNull()
  })
  it('公开检查完成前不显示登录表单，无维护时锁图标链接到管理员入口且没有页脚', async () => {
    let finish!: (value: ReturnType<typeof status>) => void
    mocks.publicStatus.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    await mount()
    expect(host.querySelector('form')).toBeNull()
    await act(async () => finish(status()))
    expect(host.querySelector('h1')?.textContent).toBe('登录账号')
    const entry = host.querySelector('a[aria-label="管理入口"]')
    expect(entry?.getAttribute('href')).toBe('/admin/login')
    expect(entry?.querySelector('svg.lucide-lock')).not.toBeNull()
    expect(host.querySelector('footer')).toBeNull()
  })

  it('主站维护中直接展示维护页，不必先登录', async () => {
    mocks.publicStatus.mockResolvedValue({
      server_time: new Date().toISOString(),
      maintenance: {
        title: '系统维护',
        content: '维护说明',
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        ends_at: new Date(Date.now() + 60_000).toISOString(),
      },
    })
    await mount()
    expect(host.querySelector('form')).toBeNull()
    expect(host.querySelector('h1')?.textContent).toBe('系统维护')
    expect(host.querySelector('a[aria-label="管理入口"]')?.getAttribute('href')).toBe(
      '/admin/login',
    )
    expect(host.querySelector('footer')).toBeNull()
    expect(mocks.login).not.toHaveBeenCalled()
  })

  it('管理员登录页不被维护或公开接口故障阻挡，并提供返回主站链接', async () => {
    window.history.replaceState({}, '', '/admin/login')
    mocks.publicStatus.mockRejectedValue(new Error('offline'))
    await mount()
    expect(host.querySelector('h1')?.textContent).toBe('管理员登录')
    expect(host.querySelector('form')).not.toBeNull()
    expect(host.querySelector('a[aria-label="返回主站"]')?.getAttribute('href')).toBe('/')
    expect(host.querySelector('a[aria-label="返回主站"] svg.lucide-lock')).not.toBeNull()
    expect(host.querySelector('footer')).toBeNull()
    expect(mocks.publicStatus).not.toHaveBeenCalled()
  })

  it('普通账号不能通过管理员入口进入受保护页面', async () => {
    window.history.replaceState({}, '', '/admin/login')
    mocks.login.mockImplementation(async () => {
      useAuthStore.setState({ account: account('user') })
    })
    await mount()
    await submit()
    expect(host.textContent).toContain('此入口仅供管理员使用')
    expect(host.querySelector('[data-testid="protected"]')).toBeNull()
    expect(host.querySelector('form')).not.toBeNull()
  })

  it('验证为管理员后进入受保护路由，已有普通用户会话也能使用管理登录页', async () => {
    window.history.replaceState({}, '', '/admin/login/')
    useAuthStore.setState({ account: account('user') })
    mocks.login.mockImplementation(async () => {
      useAuthStore.setState({ account: account('admin') })
    })
    await mount()
    expect(host.querySelector('h1')?.textContent).toBe('管理员登录')
    await submit()
    expect(host.querySelector('[data-testid="protected"]')).not.toBeNull()
    expect(mocks.publicStatus).not.toHaveBeenCalled()
    expect(mocks.privateStatus).not.toHaveBeenCalled()
  })
})
