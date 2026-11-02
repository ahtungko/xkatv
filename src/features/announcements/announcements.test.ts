import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accountSchema } from '../../../shared/account-rules'
import { useAuthStore } from '@/shared/store/authStore'

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }))
vi.mock('./service', async importOriginal => ({
  ...(await importOriginal<typeof import('./service')>()),
  readAnnouncement: mocks.read,
  saveAnnouncement: mocks.save,
}))
import { AnnouncementCenter } from './AnnouncementCenter'
import AnnouncementAdmin from './AnnouncementAdmin'
import { dismissalKey, type Announcement } from './service'
import { useAnnouncement } from './useAnnouncement'

const alice = '00000000-0000-4000-8000-000000000001'
const bob = '00000000-0000-4000-8000-000000000002'
const announcement = (revision = 1, published = true): Announcement => ({
  kind: 'notice',
  version_label: null,
  maintenance_start: null,
  maintenance_end: null,
  title: '维护通知',
  content: '第一行\n第二行',
  revision,
  published,
  updated_at: '2026-10-20T08:00:00Z',
})
function login(id = alice, role = 'user') {
  useAuthStore.setState({
    account: accountSchema.parse({
      id,
      role,
      username: 'test',
      enabled: true,
      created_at: '2026-10-20',
    }),
  })
}
let host: HTMLDivElement
let root: Root
const mount = (component = AnnouncementCenter) =>
  act(async () => root.render(createElement(component)))
const button = (label: string) =>
  Array.from(document.body.querySelectorAll('button')).find(
    item => item.textContent?.includes(label) || item.getAttribute('aria-label') === label,
  )!
const click = (label: string) => act(async () => button(label).click())
const change = (element: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(async () => {
    const prototype =
      element.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  login()
  mocks.read.mockReset().mockResolvedValue(announcement())
  mocks.save
    .mockReset()
    .mockImplementation(async (_owner, value) => ({ ...value, revision: value.revision + 1 }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const dialog = () => document.body.querySelector('[role="dialog"]')

describe('公告弹窗', () => {
  it('打开时聚焦标题，正文仍可通过键盘聚焦', async () => {
    await mount()
    const title = dialog()?.querySelector('[data-slot="dialog-title"]')
    const body = dialog()?.querySelector<HTMLElement>('[role="region"][aria-label="公告内容"]')
    expect(document.activeElement).toBe(title)
    expect(body?.tabIndex).toBe(0)
    await act(async () => body?.focus())
    expect(document.activeElement).toBe(body)
  })

  it('关闭后保留查看入口，刷新仍关闭；发布新版重新展示', async () => {
    await mount()
    expect(dialog()?.textContent).toContain('维护通知')
    await click('我知道了')
    expect(localStorage.getItem(dismissalKey(alice))).toBe('1')
    expect(dialog()).toBeNull()
    expect(button('查看站内公告')).toBeDefined()
    await act(async () => root.render(null))
    await mount()
    expect(dialog()).toBeNull()
    await click('查看站内公告')
    expect(dialog()?.textContent).toContain('维护通知')
    await click('我知道了')
    mocks.read.mockResolvedValue(announcement(2))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(dialog()).not.toBeNull()
  })

  it('账号关闭记录隔离，切回原账号保持原状态', async () => {
    await mount()
    await click('我知道了')
    await act(async () => login(bob))
    expect(dialog()).not.toBeNull()
    await act(async () => login(alice))
    expect(dialog()).toBeNull()
    expect(button('查看站内公告')).toBeDefined()
  })

  it('切账号后丢弃旧账号的在途响应', async () => {
    let finish!: (value: Announcement) => void
    mocks.read.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    await mount()
    mocks.read.mockResolvedValue(null)
    await act(async () => login(bob))
    await act(async () => finish(announcement()))
    expect(host.textContent).toBe('')
    expect(dialog()).toBeNull()
  })

  it('草稿、下架和请求失败时不影响首页其余内容', async () => {
    mocks.read.mockResolvedValue(announcement(1, false))
    await mount()
    expect(host.textContent).toBe('')
    mocks.read.mockResolvedValue(announcement())
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(dialog()?.textContent).toContain('维护通知')
    mocks.read.mockResolvedValue(null)
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(host.textContent).toBe('')
    expect(dialog()).toBeNull()
    mocks.read.mockRejectedValue(new Error('offline'))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(host.textContent).toBe('')
  })

  it('正文按文本显示，全文弹窗支持换行且不执行 HTML', async () => {
    mocks.read.mockResolvedValue({
      ...announcement(),
      content: '<img src=x onerror=alert(1)>\n第二行',
    })
    await mount()
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      '<img src=x onerror=alert(1)>\n第二行',
    )
    expect(document.body.querySelector('img')).toBeNull()
  })

  it('正文支持加粗 **bold** 与行内代码格式，同时保持换行与防 XSS 安全', async () => {
    mocks.read.mockResolvedValue({
      ...announcement(),
      content: '欢迎使用 **无痕模式** 与 `secret` 功能！\n第二行',
    })
    await mount()
    const dialogEl = document.body.querySelector('[role="dialog"]')
    expect(dialogEl?.querySelector('strong')?.textContent).toBe('无痕模式')
    expect(dialogEl?.querySelector('code')?.textContent).toBe('secret')
    expect(dialogEl?.textContent).toContain('第二行')
  })

  it('播放期间延后新版本，退出后弹出且不提前标记已读', async () => {
    await act(async () => root.render(createElement(AnnouncementCenter, { deferred: true })))
    expect(dialog()).toBeNull()
    expect(button('查看站内公告').disabled).toBe(true)
    expect(localStorage.getItem(dismissalKey(alice))).toBeNull()
    await act(async () => root.render(createElement(AnnouncementCenter, { deferred: false })))
    expect(dialog()).not.toBeNull()
    await click('我知道了')
    await act(async () => root.render(createElement(AnnouncementCenter, { deferred: true })))
    mocks.read.mockResolvedValue(announcement(2))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(dialog()).toBeNull()
    expect(localStorage.getItem(dismissalKey(alice))).toBe('1')
    await act(async () => root.render(createElement(AnnouncementCenter, { deferred: false })))
    expect(dialog()).not.toBeNull()
  })

  it('弹窗被播放页临时收起时不确认已读，退出后继续提醒', async () => {
    await mount()
    expect(dialog()).not.toBeNull()
    await act(async () => root.render(createElement(AnnouncementCenter, { deferred: true })))
    expect(dialog()).toBeNull()
    expect(localStorage.getItem(dismissalKey(alice))).toBeNull()
    await act(async () => root.render(createElement(AnnouncementCenter, { deferred: false })))
    expect(dialog()).not.toBeNull()
  })

  it('Escape 关闭也记住当前版本，其他标签页的关闭记录即时生效', async () => {
    await mount()
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(dialog()).toBeNull()
    expect(localStorage.getItem(dismissalKey(alice))).toBe('1')
    mocks.read.mockResolvedValue(announcement(2))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(dialog()).not.toBeNull()
    localStorage.setItem(dismissalKey(alice), '2')
    await act(async () =>
      window.dispatchEvent(new StorageEvent('storage', { key: dismissalKey(alice) })),
    )
    expect(dialog()).toBeNull()
  })

  it('维护弹窗显示时间，版本更新显示版本号和对应类型', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T08:30:00Z'))
    mocks.read.mockResolvedValue({
      ...announcement(),
      kind: 'maintenance',
      maintenance_start: '2026-10-20T08:00:00Z',
      maintenance_end: '2026-10-20T09:00:00Z',
    })
    await mount()
    expect(dialog()?.textContent).toContain('开始时间：')
    expect(dialog()?.textContent).toContain('结束时间：')
    mocks.read.mockResolvedValue({
      ...announcement(2),
      kind: 'version_update',
      version_label: 'v2.1.0',
    })
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(dialog()?.textContent).toContain('版本更新')
    expect(dialog()?.textContent).toContain('v2.1.0')
    expect(dialog()?.textContent).not.toContain('开始时间：')
  })

  it.each(['user', 'admin'])('维护已到结束时间时不再向 %s 提醒，也不保留查看入口', async role => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T09:00:00Z'))
    login(alice, role)
    mocks.read.mockResolvedValue({
      ...announcement(),
      kind: 'maintenance',
      maintenance_start: '2026-10-20T08:00:00Z',
      maintenance_end: '2026-10-20T09:00:00Z',
    })
    await mount()
    expect(dialog()).toBeNull()
    expect(button('查看站内公告')).toBeUndefined()
    expect(localStorage.getItem(dismissalKey(alice))).toBeNull()
    await act(async () => login(bob, role))
    expect(dialog()).toBeNull()
    expect(button('查看站内公告')).toBeUndefined()
  })

  it('维护到期时自动收起已打开的弹窗，无需等下一次轮询', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-10-20T08:59:59Z'))
    mocks.read.mockResolvedValue({
      ...announcement(),
      kind: 'maintenance',
      maintenance_start: '2026-10-20T08:00:00Z',
      maintenance_end: '2026-10-20T09:00:00Z',
    })
    await mount()
    expect(dialog()).not.toBeNull()
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(dialog()).toBeNull()
    expect(button('查看站内公告')).toBeUndefined()
    expect(mocks.read).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(dismissalKey(alice))).toBeNull()
  })

  it('播放期间已过期的维护公告，退出播放后不再补弹', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-10-20T08:59:59Z'))
    mocks.read.mockResolvedValue({
      ...announcement(),
      kind: 'maintenance',
      maintenance_start: '2026-10-20T08:00:00Z',
      maintenance_end: '2026-10-20T09:00:00Z',
    })
    await act(async () => root.render(createElement(AnnouncementCenter, { deferred: true })))
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    await act(async () => root.render(createElement(AnnouncementCenter, { deferred: false })))
    expect(dialog()).toBeNull()
    expect(button('查看站内公告')).toBeUndefined()
  })

  it('公告改成普通通知后，旧维护的到期定时器不会关闭新公告', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-10-20T08:59:59Z'))
    mocks.read.mockResolvedValue({
      ...announcement(),
      kind: 'maintenance',
      maintenance_start: '2026-10-20T08:00:00Z',
      maintenance_end: '2026-10-20T09:00:00Z',
    })
    await mount()
    mocks.read.mockResolvedValue({ ...announcement(2), title: '普通通知' })
    await act(async () => window.dispatchEvent(new Event('focus')))
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(dialog()?.textContent).toContain('普通通知')
    expect(button('查看站内公告')).toBeDefined()
  })
})

describe('管理员公告编辑', () => {
  it.each([
    { minutes: 30, label: '现在起 30 分钟' },
    { minutes: 60, label: '现在起 1 小时' },
    { minutes: 120, label: '现在起 2 小时' },
  ])(
    '快捷设置 $label 使用点击时的日期和时间覆盖旧维护时段，不自动保存',
    async ({ minutes, label }) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-22T15:20:00Z'))
      login(alice, 'admin')
      mocks.read.mockResolvedValue({
        ...announcement(),
        kind: 'maintenance',
        maintenance_start: '2026-10-20T08:00:00Z',
        maintenance_end: '2026-10-20T09:00:00Z',
      })
      await mount(AnnouncementAdmin)
      const times = host.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')
      expect(new Date(times[0].value).toISOString()).toBe('2026-10-20T08:00:00.000Z')
      // 页面打开后过了半小时，仍须使用点击瞬间而非打开页面时的时间。
      vi.setSystemTime(new Date('2026-10-22T15:50:00Z'))
      await click(label)
      expect(new Date(times[0].value).getTime()).toBe(Date.now())
      expect(new Date(times[1].value).getTime()).toBe(Date.now() + minutes * 60_000)
      expect(times[1].min).toBe(times[0].value)
      expect(mocks.save).not.toHaveBeenCalled()
      await click('发布更新')
      expect(mocks.save).toHaveBeenLastCalledWith(
        alice,
        expect.objectContaining({
          maintenance_start: new Date(times[0].value).toISOString(),
          maintenance_end: new Date(times[1].value).toISOString(),
          published: true,
        }),
      )
    },
  )

  it.each(['notice', 'maintenance', 'version_update'] as const)(
    '%s 预览展示当前未保存内容，关闭后保留编辑且不发布或标记已读',
    async kind => {
      login(alice, 'admin')
      mocks.read.mockResolvedValue(announcement(1, false))
      localStorage.setItem(dismissalKey(alice), '旧的已读版本')
      await mount(AnnouncementAdmin)
      const select = host.querySelector('select')!
      await act(async () => {
        select.value = kind
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })
      if (kind === 'version_update')
        await change(host.querySelector('input[placeholder="例如：v2.1.0"]')!, ' v2.2.0 ')
      if (kind === 'maintenance') {
        const times = host.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')
        await change(times[0], '2026-10-22T10:00')
        await change(times[1], '2026-10-22T12:00')
      }
      const title = host.querySelector<HTMLInputElement>('input[placeholder="例如：本周维护通知"]')!
      const content = host.querySelector('textarea')!
      if (kind !== 'maintenance') await change(title, ' 当前草稿标题 ')
      await change(content, '第一行\n<img src=x onerror=alert(1)>')
      await click('预览公告')
      expect(dialog()?.textContent).toContain(kind === 'maintenance' ? '系统维护' : '当前草稿标题')
      expect(dialog()?.textContent).toContain('仅供查看，不会保存或发布')
      expect(dialog()?.textContent).toContain('第一行\n<img src=x onerror=alert(1)>')
      expect(dialog()?.querySelector('img')).toBeNull()
      if (kind === 'maintenance') {
        expect(dialog()?.textContent).toContain('维护通知')
        expect(dialog()?.textContent).toContain(new Date('2026-10-22T10:00').toLocaleString())
        expect(dialog()?.textContent).toContain(new Date('2026-10-22T12:00').toLocaleString())
      } else {
        expect(dialog()?.textContent).not.toContain('开始时间：')
        expect(dialog()?.textContent).toContain(kind === 'notice' ? '普通公告' : '版本更新')
        if (kind === 'version_update') expect(dialog()?.textContent).toContain('v2.2.0')
      }
      if (kind === 'notice')
        await act(async () =>
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
        )
      else await click('返回编辑')
      expect(dialog()).toBeNull()
      if (kind !== 'maintenance') expect(title.value).toBe(' 当前草稿标题 ')
      expect(content.value).toBe('第一行\n<img src=x onerror=alert(1)>')
      expect(select.value).toBe(kind)
      expect(mocks.save).not.toHaveBeenCalled()
      expect(mocks.read).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem(dismissalKey(alice))).toBe('旧的已读版本')
    },
  )

  it('维护隐藏标题、正文可留空，未填时间可预览但不能发布', async () => {
    login(alice, 'admin')
    mocks.read.mockResolvedValue({
      ...announcement(0, false),
      kind: 'maintenance',
      title: '',
      content: '',
    })
    await mount(AnnouncementAdmin)
    expect(host.querySelector('input[placeholder="例如：本周维护通知"]')).toBeNull()
    expect(host.textContent).toContain('维护说明（可选）')
    expect(button('预览公告').disabled).toBe(false)
    expect(button('发布公告').disabled).toBe(true)
    await click('预览公告')
    expect(dialog()?.textContent).toContain('系统维护')
    expect(dialog()?.textContent).not.toContain('Invalid Date')
    await click('返回编辑')
    await click('现在起 30 分钟')
    expect(button('发布公告').disabled).toBe(false)
    await click('发布公告')
    expect(mocks.save).toHaveBeenLastCalledWith(
      alice,
      expect.objectContaining({
        title: '系统维护',
        content: '',
        kind: 'maintenance',
        published: true,
      }),
    )
  })

  it('普通公告和版本更新无需正文即可预览和发布，切换维护不会覆盖未保存标题', async () => {
    login(alice, 'admin')
    mocks.read.mockResolvedValue({ ...announcement(0, false), content: '' })
    await mount(AnnouncementAdmin)
    const title = host.querySelector<HTMLInputElement>('input[placeholder="例如：本周维护通知"]')!
    await change(title, '保留的普通公告标题')
    const select = host.querySelector('select')!
    for (const kind of ['maintenance', 'version_update', 'notice']) {
      await act(async () => {
        select.value = kind
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(button('预览公告').disabled).toBe(false)
      if (kind !== 'maintenance') {
        expect(
          host.querySelector<HTMLInputElement>('input[placeholder="例如：本周维护通知"]')!.value,
        ).toBe('保留的普通公告标题')
        expect(button('发布公告').disabled).toBe(false)
      }
    }
    await click('发布公告')
    expect(mocks.save).toHaveBeenLastCalledWith(
      alice,
      expect.objectContaining({ title: '保留的普通公告标题', content: '', published: true }),
    )
  })

  it('公告类型显示对应字段，重新加载重置类型和版本号', async () => {
    login(alice, 'admin')
    await mount(AnnouncementAdmin)
    let select = host.querySelector('select')!
    await act(async () => {
      select.value = 'version_update'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await change(host.querySelector('input[placeholder="例如：v2.1.0"]')!, 'v2.1.0')
    await click('重新加载（放弃未保存修改）')
    expect(host.querySelector('select')?.value).toBe('notice')
    expect(host.querySelector('input[placeholder="例如：v2.1.0"]')).toBeNull()
    select = host.querySelector('select')!
    await act(async () => {
      select.value = 'version_update'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await change(host.querySelector('input[placeholder="例如：v2.1.0"]')!, 'v2.1.0')
    await click('发布更新')
    expect(mocks.save).toHaveBeenLastCalledWith(
      alice,
      expect.objectContaining({
        kind: 'version_update',
        version_label: 'v2.1.0',
        maintenance_start: null,
      }),
    )
    await act(async () => {
      select.value = 'maintenance'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const times = host.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')
    expect(times).toHaveLength(2)
    await change(times[0], '2026-10-20T10:00')
    await change(times[1], '2026-10-20T12:00')
    await click('发布更新')
    expect(mocks.save).toHaveBeenLastCalledWith(
      alice,
      expect.objectContaining({
        kind: 'maintenance',
        version_label: null,
        maintenance_start: new Date('2026-10-20T10:00').toISOString(),
        maintenance_end: new Date('2026-10-20T12:00').toISOString(),
      }),
    )
  })
  it('重新加载相同服务端版本也会丢弃标题、正文和错误提示', async () => {
    login(alice, 'admin')
    mocks.save.mockRejectedValue(new Error('保存失败'))
    await mount(AnnouncementAdmin)
    await change(host.querySelector('input')!, '未保存的标题')
    await change(host.querySelector('textarea')!, '未保存的正文')
    await click('发布更新')
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('保存失败')
    await click('重新加载（放弃未保存修改）')
    expect(mocks.read).toHaveBeenCalledTimes(2)
    expect(host.querySelector('input')?.value).toBe('维护通知')
    expect(host.querySelector('textarea')?.value).toBe('第一行\n第二行')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('普通用户没有公告管理表单', async () => {
    await mount(AnnouncementAdmin)
    expect(host.querySelector('form')).toBeNull()
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('发布后继续编辑使用新版本，下架不发布尚未保存的修改', async () => {
    login(alice, 'admin')
    mocks.read.mockResolvedValue(announcement(0, false))
    await mount(AnnouncementAdmin)
    await change(host.querySelector('input')!, '新公告')
    await click('发布公告')
    expect(mocks.save).toHaveBeenLastCalledWith(
      alice,
      expect.objectContaining({ title: '新公告', revision: 0, published: true }),
    )
    await change(host.querySelector('input')!, '未保存的标题')
    await click('下架公告')
    expect(mocks.save).toHaveBeenLastCalledWith(
      alice,
      expect.objectContaining({ title: '新公告', revision: 1, published: false }),
    )
    expect(host.querySelector('input')?.value).toBe('未保存的标题')
    await click('保存草稿')
    expect(mocks.save).toHaveBeenLastCalledWith(
      alice,
      expect.objectContaining({ title: '未保存的标题', revision: 2, published: false }),
    )
  })

  it('保存冲突保留本机编辑并显示失败信息', async () => {
    login(alice, 'admin')
    mocks.save.mockRejectedValue(new Error('公告已在其他页面更新'))
    await mount(AnnouncementAdmin)
    await change(host.querySelector('input')!, '本机修改')
    await click('发布更新')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('其他页面更新')
    expect(host.querySelector('input')?.value).toBe('本机修改')
  })
})

function AnnouncementStateProbe() {
  const { announcement, loading, error } = useAnnouncement(false)
  return createElement('output', null, JSON.stringify({ announcement, loading, error }))
}

describe('公告 Hook 空账号状态', () => {
  it('未登录时不显示加载中，也不发送请求', async () => {
    useAuthStore.setState({ account: null })
    await mount(AnnouncementStateProbe)
    expect(JSON.parse(host.textContent!)).toEqual({ announcement: null, loading: false, error: '' })
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('请求中退出登录后停止加载并忽略旧请求结果', async () => {
    let finish!: (value: Announcement) => void
    mocks.read.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve
        }),
    )
    await mount(AnnouncementStateProbe)
    expect(JSON.parse(host.textContent!).loading).toBe(true)
    await act(async () => useAuthStore.setState({ account: null }))
    expect(JSON.parse(host.textContent!)).toEqual({ announcement: null, loading: false, error: '' })
    await act(async () => finish(announcement()))
    expect(JSON.parse(host.textContent!)).toEqual({ announcement: null, loading: false, error: '' })
  })
})
