import { z } from 'zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'
import { getPublicEnv } from '@/shared/config/runtimeEnv'

const timestamp = z.string().datetime({ offset: true })
const statusSchema = z.object({
  server_time: timestamp,
  maintenance: z
    .object({
      title: z.string().max(100),
      content: z.string().max(10000),
      starts_at: timestamp,
      ends_at: timestamp,
    })
    .nullable(),
})
export type MaintenanceStatus = z.infer<typeof statusSchema>

let publicClient: SupabaseClient | undefined

export async function readPublicMaintenance(signal: AbortSignal): Promise<MaintenanceStatus> {
  if (!publicClient) {
    const url = getPublicEnv('XKA_SUPABASE_URL')?.trim()
    const key = (
      getPublicEnv('XKA_SUPABASE_ANON_KEY') || getPublicEnv('XKA_SUPABASE_PUBLISHABLE_KEY')
    )?.trim()
    if (!url || !key) throw new Error('暂时无法确认网站状态，请重试或联系管理员')
    // A stale signed-in session must not prevent the public maintenance check.
    publicClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'xkatv-public-maintenance',
      },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    })
  }
  const { data, error } = await publicClient
    .rpc('get_public_site_maintenance_status')
    .abortSignal(signal)
  if (error) throw new Error('暂时无法确认网站状态，请重试或联系管理员')
  return statusSchema.parse(data)
}

export function maintenanceIsActive(status: MaintenanceStatus, serverNow: number) {
  const window = status.maintenance
  return (
    !!window && Date.parse(window.starts_at) <= serverNow && serverNow < Date.parse(window.ends_at)
  )
}

export async function readMaintenance(
  ownerId: string,
  signal: AbortSignal,
): Promise<MaintenanceStatus> {
  const { account, session } = useAuthStore.getState()
  if (!syncClient || account?.id !== ownerId || session?.user.id !== ownerId)
    throw new Error('账号已变化，请重新登录')
  const { data, error } = await syncClient
    .rpc('get_site_maintenance_status')
    .setHeader('Authorization', `Bearer ${session.access_token}`)
    .abortSignal(signal)
  if (error) throw new Error('暂时无法确认网站状态，请重试或联系管理员')
  return statusSchema.parse(data)
}
