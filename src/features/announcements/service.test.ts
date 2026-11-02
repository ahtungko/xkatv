import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), result: vi.fn(), getState: vi.fn() }))
vi.mock('@/shared/sync/client', () => ({ syncClient: { rpc: mocks.rpc } }))
vi.mock('@/shared/store/authStore', () => ({ useAuthStore: { getState: mocks.getState } }))
import { readAnnouncement, saveAnnouncement, type Announcement } from './service'

const ownerId = '00000000-0000-4000-8000-000000000001'
const announcement: Announcement = {
  kind: 'notice',
  version_label: null,
  maintenance_start: null,
  maintenance_end: null,
  title: '维护通知',
  content: '公告正文',
  published: true,
  revision: 1,
  updated_at: '2026-10-20T08:00:00Z',
}
beforeEach(() => {
  mocks.rpc.mockClear()
  mocks.rpc.mockReturnValue({ setHeader: mocks.result })
  mocks.getState.mockReturnValue({ account: { id: ownerId }, session: { access_token: 'jwt' } })
})

describe('公告 RPC 错误提示', () => {
  it('维护公告使用固定标题，正文可留空', async () => {
    const value = {
      ...announcement,
      kind: 'maintenance' as const,
      title: '',
      content: '   ',
      maintenance_start: '2026-10-22T08:00:00Z',
      maintenance_end: '2026-10-22T09:00:00Z',
    }
    mocks.result.mockResolvedValue({
      data: { ...value, title: '系统维护', content: '' },
      error: null,
    })
    await saveAnnouncement(ownerId, value)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_site_announcement',
      expect.objectContaining({ p_title: '系统维护', p_content: '' }),
    )
  })

  it.each(['notice', 'version_update'] as const)('%s 正文可留空但发布时标题仍必填', async kind => {
    const value = { ...announcement, kind, content: '' }
    mocks.result.mockResolvedValue({ data: value, error: null })
    await saveAnnouncement(ownerId, value)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_site_announcement',
      expect.objectContaining({ p_content: '' }),
    )
    mocks.rpc.mockClear()
    await expect(saveAnnouncement(ownerId, { ...value, title: ' ' })).rejects.toThrow(
      '请填写公告标题',
    )
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('维护公告发布时必须填写两个时间，草稿仍可暂存', async () => {
    await expect(
      saveAnnouncement(ownerId, { ...announcement, kind: 'maintenance' }),
    ).rejects.toThrow('发布维护公告需要填写开始时间和结束时间')
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.result.mockResolvedValue({
      data: { ...announcement, kind: 'maintenance', published: false },
      error: null,
    })
    await saveAnnouncement(ownerId, { ...announcement, kind: 'maintenance', published: false })
    expect(mocks.rpc).toHaveBeenCalled()
  })
  it('旧公告响应补齐默认类型，不影响已发布内容和已读版本', async () => {
    const legacy = {
      title: '原公告',
      content: '原正文',
      published: true,
      revision: 7,
      updated_at: announcement.updated_at,
    }
    mocks.rpc.mockReturnValue({
      setHeader: () => ({ abortSignal: vi.fn().mockResolvedValue({ data: legacy, error: null }) }),
    })
    expect(await readAnnouncement(ownerId, new AbortController().signal)).toMatchObject({
      ...legacy,
      kind: 'notice',
      version_label: null,
      maintenance_start: null,
      maintenance_end: null,
    })
  })

  it('读取维护公告时接受 PostgreSQL 的时区偏移和微秒时间格式', async () => {
    const data = {
      ...announcement,
      kind: 'maintenance',
      maintenance_start: '2026-10-20T08:00:00.123456+00:00',
      maintenance_end: '2026-10-20T09:00:00+00:00',
    }
    mocks.rpc.mockReturnValue({
      setHeader: () => ({ abortSignal: vi.fn().mockResolvedValue({ data, error: null }) }),
    })
    expect(await readAnnouncement(ownerId, new AbortController().signal)).toEqual(data)
  })

  it('维护结束时间早于开始时不发送请求', async () => {
    await expect(
      saveAnnouncement(ownerId, {
        ...announcement,
        kind: 'maintenance',
        maintenance_start: '2026-10-20T10:00:00Z',
        maintenance_end: '2026-10-20T09:00:00Z',
      }),
    ).rejects.toThrow('维护结束时间必须晚于开始时间')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('提交时清除其他类型的附加字段', async () => {
    mocks.result.mockResolvedValue({ data: announcement, error: null })
    await saveAnnouncement(ownerId, {
      ...announcement,
      version_label: '旧版本',
      maintenance_start: '2026-10-20T10:00:00Z',
    })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_site_announcement',
      expect.objectContaining({
        p_kind: 'notice',
        p_version_label: null,
        p_maintenance_start: null,
        p_maintenance_end: null,
      }),
    )
  })
  it('参数校验失败提示检查内容，不误报为网络故障', async () => {
    mocks.result.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Invalid announcement' },
    })
    await expect(saveAnnouncement(ownerId, announcement)).rejects.toThrow(
      '公告内容不符合要求，请检查标题与正文',
    )
  })

  it('网络故障仍提示检查网络并重试', async () => {
    mocks.result.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await expect(saveAnnouncement(ownerId, announcement)).rejects.toThrow(
      '公告请求失败，请检查网络后重试',
    )
  })
})
