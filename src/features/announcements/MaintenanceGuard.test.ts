import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/shared/store/authStore'
import { accountSchema } from '../../../shared/account-rules'
import { MaintenanceGuard } from './MaintenanceGuard'
import { maintenanceIsActive, type MaintenanceStatus } from './maintenance'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  readPublic: vi.fn(),
  logout: vi.fn(),
  dispose: vi.fn(),
}))
vi.mock('./maintenance', async importOriginal => ({
  ...(await importOriginal<typeof import('./maintenance')>()),
  readMaintenance: mocks.read,
  readPublicMaintenance: mocks.readPublic,
}))
const owner = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const base = Date.parse('2026-10-20T08:00:00Z')
let host: HTMLDivElement
let root: Root
function login(id = owner, role = 'user') {
  useAuthStore.setState({
    account: accountSchema.parse({
      id,
      role,
      username: 'test',
      enabled: true,
      created_at: '2026-10-20',
    }),
    logout: mocks.logout,
  })
}
function status(start = 10_000, end = 20_000): MaintenanceStatus {
  return {
    server_time: new Date(base + performance.now()).toISOString(),
    maintenance: {
      title: '网站维护中',
      content: '升级服务，请稍后访问。',
      starts_at: new Date(base + start).toISOString(),
      ends_at: new Date(base + end).toISOString(),
    },
  }
}
function Player() {
  useEffect(() => () => mocks.dispose(), [])
  return createElement('div', { 'data-testid': 'app' }, '网站内容')
}
const mount = () =>
  act(async () => root.render(createElement(MaintenanceGuard, null, createElement(Player))))
const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms))
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  })
  vi.setSystemTime(new Date('2040-01-01T00:00:00Z'))
  mocks.read.mockReset().mockImplementation(async () => status())
  mocks.readPublic.mockReset().mockImplementation(async () => status())
  mocks.logout.mockReset().mockResolvedValue(undefined)
  mocks.dispose.mockClear()
  login()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('定时维护访问控制', () => {
  it('访客先检查公开维护状态，维护中不挂载登录内容或调用已登录接口', async () => {
    useAuthStore.setState({ account: null, session: null })
    mocks.readPublic.mockImplementation(async () => status(-10_000, 60_000))
    await mount()
    expect(host.textContent).toContain('系统维护')
    expect(host.querySelector('[data-testid="app"]')).toBeNull()
    expect(host.querySelector('a[href="/admin/login"]')?.getAttribute('aria-label')).toBe(
      '管理入口',
    )
    expect(host.querySelector('a[href="/admin/login"] img')).not.toBeNull()
    expect(host.querySelector('footer')).toBeNull()
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.readPublic).toHaveBeenCalledTimes(1)
  })

  it('访客等待公开查询时不提前显示登录内容，维护结束后自动恢复入口', async () => {
    useAuthStore.setState({ account: null, session: null })
    let finish!: (value: MaintenanceStatus) => void
    mocks.readPublic.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    await mount()
    expect(host.querySelector('[data-testid="app"]')).toBeNull()
    await act(async () => finish(status(-10_000, 1000)))
    expect(host.textContent).toContain('系统维护')
    await advance(1000)
    expect(host.querySelector('[data-testid="app"]')).not.toBeNull()
  })

  it('访客在计划维护前可以登录，到开始时间会自动隐藏登录内容', async () => {
    useAuthStore.setState({ account: null, session: null })
    await mount()
    expect(host.querySelector('[data-testid="app"]')).not.toBeNull()
    await advance(10_000)
    expect(host.textContent).toContain('系统维护')
    expect(host.querySelector('[data-testid="app"]')).toBeNull()
  })

  it('公开查询失败时保留维护检查页与管理员入口，网络恢复后重试', async () => {
    useAuthStore.setState({ account: null, session: null })
    mocks.readPublic.mockRejectedValueOnce(new Error('offline'))
    await mount()
    expect(host.textContent).toContain('暂时无法确认网站状态')
    expect(host.querySelector('[data-testid="app"]')).toBeNull()
    expect(host.querySelector('a[href="/admin/login"]')).not.toBeNull()
    mocks.readPublic.mockResolvedValue({
      server_time: new Date(base).toISOString(),
      maintenance: null,
    })
    await act(async () => window.dispatchEvent(new Event('online')))
    expect(host.querySelector('[data-testid="app"]')).not.toBeNull()
  })

  it('空正文不显示说明区，旧自定义标题也使用固定维护标题', async () => {
    const value = status(-10_000, 60_000)
    value.maintenance!.title = '旧的自定义标题'
    value.maintenance!.content = '   '
    mocks.read.mockResolvedValue(value)
    await mount()
    expect(host.querySelector('h1')?.textContent).toBe('系统维护')
    expect(host.querySelector('[aria-label="维护说明"]')).toBeNull()
    expect(host.querySelector('[role="timer"]')).not.toBeNull()
  })

  it('长正文保留全文和换行，以独立区域呈现，时间和按钮不在正文中', async () => {
    const value = status(-10_000, 60_000)
    value.maintenance!.content = '维护说明\n' + 'https://example.com/'.repeat(400)
    mocks.read.mockResolvedValue(value)
    await mount()
    const body = host.querySelector<HTMLElement>('[aria-label="维护说明正文"]')!
    expect(body.textContent).toBe(value.maintenance!.content)
    expect(body.tabIndex).toBe(0)
    expect(body.querySelector('[role="timer"]')).toBeNull()
    expect(body.querySelector('button')).toBeNull()
    expect(host.textContent).toContain('重新检查')
  })

  it('倒计时按服务器时间逐秒更新，不受本机时钟修改影响，到时自动恢复访问', async () => {
    mocks.read.mockImplementation(async () => status(-10_000, 3500))
    await mount()
    const remaining = () => host.querySelector('[role="timer"]')?.textContent
    expect(remaining()).toBe('00:00:04')
    await advance(1000)
    expect(remaining()).toBe('00:00:03')
    vi.setSystemTime(new Date('2050-01-01T00:00:00Z'))
    await advance(1000)
    expect(remaining()).toBe('00:00:02')
    await advance(1500)
    expect(host.querySelector('[role="timer"]')).toBeNull()
    expect(host.textContent).toContain('网站内容')
    expect(mocks.logout).not.toHaveBeenCalled()
  })

  it('维护超过一天时显示天数，管理员调整结束时间后同步更新倒计时', async () => {
    mocks.read.mockImplementation(async () => status(-10_000, 90_061_000))
    await mount()
    expect(host.querySelector('[role="timer"]')?.textContent).toBe('1 天 01:01:01')
    mocks.read.mockImplementation(async () => status(-10_000, 60_000))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(host.querySelector('[role="timer"]')?.textContent).toBe('00:01:00')
    await advance(1000)
    expect(host.querySelector('[role="timer"]')?.textContent).toBe('00:00:59')
  })

  it('按服务器时间准确进入和结束维护，设备时钟偏差不影响，开始时卸载播放器', async () => {
    await mount()
    expect(host.textContent).toContain('网站内容')
    await advance(9999)
    expect(host.textContent).toContain('网站内容')
    await advance(1)
    expect(host.textContent).toContain('系统维护')
    expect(host.querySelector('[data-testid="app"]')).toBeNull()
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    await advance(10_000)
    expect(host.textContent).toContain('网站内容')
    expect(mocks.logout).not.toHaveBeenCalled()
  })

  it('活跃维护不受公告已读记录影响，管理员始终豁免且不需等待状态请求', async () => {
    mocks.read.mockImplementation(async () => status(-10_000, 60_000))
    localStorage.setItem(`xkatv-announcement-dismissed:${owner}`, '100')
    await mount()
    expect(host.textContent).toContain('系统维护')
    await act(async () => login(owner, 'admin'))
    expect(host.textContent).toContain('网站内容')
    mocks.read.mockClear()
    await act(async () => root.render(null))
    await mount()
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('管理员提前下架维护后，在下一次检查恢复访问', async () => {
    mocks.read.mockImplementation(async () => status(-10_000, 60_000))
    await mount()
    expect(host.textContent).toContain('系统维护')
    mocks.read.mockImplementation(async () => ({
      server_time: new Date(base + performance.now()).toISOString(),
      maintenance: null,
    }))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(host.textContent).toContain('网站内容')
  })

  it('检查失败时不放行，网络恢复后重试并恢复访问', async () => {
    mocks.read.mockRejectedValue(new Error('offline'))
    await mount()
    expect(host.textContent).toContain('暂时无法确认网站状态')
    expect(host.querySelector('[data-testid="app"]')).toBeNull()
    mocks.read.mockResolvedValue({ server_time: new Date(base).toISOString(), maintenance: null })
    await act(async () => window.dispatchEvent(new Event('online')))
    expect(host.textContent).toContain('网站内容')
  })

  it('旧账号的迟到响应不能控制新账号的访问', async () => {
    let finish!: (value: MaintenanceStatus) => void
    mocks.read.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    await mount()
    await act(async () => login(other))
    expect(host.textContent).toContain('网站内容')
    await act(async () => finish(status(-10_000, 60_000)))
    expect(host.textContent).toContain('网站内容')
  })

  it('维护页保留退出账号按钮和顶部 Logo 管理入口', async () => {
    mocks.read.mockImplementation(async () => status(-10_000, 60_000))
    await mount()
    const button = Array.from(host.querySelectorAll('button')).find(item =>
      item.textContent?.includes('退出账号'),
    )!
    await act(async () => button.click())
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(host.querySelector('a[href="/admin/login"]')?.getAttribute('aria-label')).toBe(
      '管理入口',
    )
  })

  it('维护窗口采用开始包含、结束排除规则', () => {
    const value = status(10_000, 20_000)
    expect(maintenanceIsActive(value, base + 9999)).toBe(false)
    expect(maintenanceIsActive(value, base + 10_000)).toBe(true)
    expect(maintenanceIsActive(value, base + 20_000)).toBe(false)
  })
})
