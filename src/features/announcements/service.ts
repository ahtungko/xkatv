import { z } from 'zod'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'

const announcementSchema = z.object({
  kind: z.enum(['notice', 'maintenance', 'version_update']).default('notice'),
  version_label: z.string().max(40).nullable().default(null),
  maintenance_start: z.string().datetime({ offset: true }).nullable().default(null),
  maintenance_end: z.string().datetime({ offset: true }).nullable().default(null),
  title: z.string().max(100),
  content: z.string().max(10000),
  published: z.boolean(),
  revision: z.number().int().nonnegative(),
  updated_at: z.string(),
})

export type Announcement = z.infer<typeof announcementSchema>

function credentials(ownerId: string) {
  const { account, session } = useAuthStore.getState()
  if (!syncClient) throw new Error('请先配置 Supabase')
  if (account?.id !== ownerId || !session) throw new Error('账号已变化，请重新打开公告')
  return { client: syncClient, token: session.access_token }
}

function announcementError(error: { code?: string; message: string }) {
  if (['PGRST202', '42P01', '42883'].includes(error.code || ''))
    return new Error('请先在 Supabase 依次执行公告迁移 202610200001 至 202610220001')
  if (error.message.includes('Announcement changed'))
    return new Error('公告已在其他页面更新。请重新加载后再编辑，本次修改尚未保存。')
  if (error.message.includes('Invalid announcement'))
    return new Error('公告内容不符合要求，请检查标题与正文')
  if (error.code === '42501' || /Inactive account|Admin required/.test(error.message))
    return new Error('账号已失效或没有公告管理权限，请重新登录')
  return new Error('公告请求失败，请检查网络后重试')
}

export async function readAnnouncement(ownerId: string, signal: AbortSignal) {
  const { client, token } = credentials(ownerId)
  const { data, error } = await client
    .rpc('get_site_announcement')
    .setHeader('Authorization', `Bearer ${token}`)
    .abortSignal(signal)
  if (error) throw announcementError(error)
  return data === null ? null : announcementSchema.parse(data)
}

export async function saveAnnouncement(ownerId: string, value: Announcement) {
  const { client, token } = credentials(ownerId)
  const parsed = announcementSchema.parse({
    ...value,
    title: value.kind === 'maintenance' ? '系统维护' : value.title.trim(),
    content: value.content.trim(),
    version_label: value.kind === 'version_update' ? value.version_label?.trim() || null : null,
    maintenance_start: value.kind === 'maintenance' ? value.maintenance_start : null,
    maintenance_end: value.kind === 'maintenance' ? value.maintenance_end : null,
  })
  if (parsed.published && !parsed.title) throw new Error('请填写公告标题')
  if (
    parsed.published &&
    parsed.kind === 'maintenance' &&
    (!parsed.maintenance_start || !parsed.maintenance_end)
  )
    throw new Error('发布维护公告需要填写开始时间和结束时间')
  if (
    parsed.maintenance_start &&
    parsed.maintenance_end &&
    Date.parse(parsed.maintenance_end) <= Date.parse(parsed.maintenance_start)
  )
    throw new Error('维护结束时间必须晚于开始时间')
  const { data, error } = await client
    .rpc('save_site_announcement', {
      p_title: parsed.title,
      p_content: parsed.content,
      p_published: parsed.published,
      p_expected_revision: parsed.revision,
      p_kind: parsed.kind,
      p_version_label: parsed.version_label,
      p_maintenance_start: parsed.maintenance_start,
      p_maintenance_end: parsed.maintenance_end,
    })
    .setHeader('Authorization', `Bearer ${token}`)
  if (error) throw announcementError(error)
  credentials(ownerId)
  return announcementSchema.parse(data)
}

export const dismissalKey = (ownerId: string) => `xkatv-announcement-dismissed:${ownerId}`

export function readDismissal(ownerId: string) {
  try {
    return localStorage.getItem(dismissalKey(ownerId))
  } catch {
    return null
  }
}

export function dismissAnnouncement(ownerId: string, revision: number) {
  try {
    localStorage.setItem(dismissalKey(ownerId), String(revision))
  } catch {
    // The dialog can still be dismissed for this page when storage is unavailable.
  }
}
