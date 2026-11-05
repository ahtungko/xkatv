import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'
import { useSettingStore } from '@/shared/store/settingStore'

const BROADCAST_CHANNEL_NAME = 'xkatv-tv-cast-settings'

interface TvCastSettingMessage {
  type: 'TV_CAST_SETTING_CHANGED'
  enabled: boolean
}

let broadcastChannel: BroadcastChannel | null = null

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null
  }
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
  }
  return broadcastChannel
}

export function resetTvCastSettingSyncForTest(): void {
  try {
    broadcastChannel?.close()
  } catch {
    // ignore
  }
  broadcastChannel = null
}

export function parseSettingValue(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw
  if (raw && typeof raw === 'object' && 'enabled' in raw) {
    return Boolean((raw as { enabled: unknown }).enabled)
  }
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return null
}

/**
 * Fetch the global TV cast setting from Supabase site_settings table.
 */
export async function fetchRemoteTvCastSetting(signal?: AbortSignal): Promise<boolean | null> {
  if (!syncClient) return null

  try {
    let rpcQuery = syncClient.rpc('get_site_setting', { p_key: 'is_tv_cast_enabled' })
    if (signal) {
      rpcQuery = rpcQuery.abortSignal(signal)
    }
    const { data, error } = await rpcQuery

    if (error) {
      let tableQuery = syncClient
        .from('site_settings')
        .select('value')
        .eq('key', 'is_tv_cast_enabled')
      if (signal) {
        tableQuery = tableQuery.abortSignal(signal)
      }
      const { data: tableData, error: tableError } = await tableQuery.maybeSingle()

      if (tableError || !tableData) return null
      const parsed = parseSettingValue(tableData.value)
      if (parsed !== null) {
        useSettingStore.getState().setSystemSettings({ isTvCastEnabled: parsed })
      }
      return parsed
    }

    const parsed = parseSettingValue(data)
    if (parsed !== null) {
      useSettingStore.getState().setSystemSettings({ isTvCastEnabled: parsed })
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Set the global TV cast setting (admin only; publish locally after remote persistence succeeds).
 */
export async function setGlobalTvCastEnabled(enabled: boolean): Promise<void> {
  const { account, session } = useAuthStore.getState()
  if (account?.role !== 'admin' || !account.enabled) {
    throw new Error('仅管理员可以修改全站大屏投屏状态')
  }
  if (syncClient && !session?.access_token) {
    throw new Error('登录已过期，请重新登录后再试')
  }

  if (syncClient) {
    if (account?.role === 'admin' && session?.access_token) {
      const { error } = await syncClient
        .rpc('set_site_setting', {
          p_key: 'is_tv_cast_enabled',
          p_value: enabled,
        })
        .setHeader('Authorization', `Bearer ${session.access_token}`)

      if (error) {
        const { error: upsertError } = await syncClient
          .from('site_settings')
          .upsert({
            key: 'is_tv_cast_enabled',
            value: enabled,
            updated_at: new Date().toISOString(),
          })
          .setHeader('Authorization', `Bearer ${session.access_token}`)

        if (upsertError) {
          throw new Error(upsertError.message || error.message || '同步全局配置至数据库失败')
        }
      }
    }
  }

  useSettingStore.getState().setSystemSettings({ isTvCastEnabled: enabled })

  try {
    const channel = getBroadcastChannel()
    channel?.postMessage({
      type: 'TV_CAST_SETTING_CHANGED',
      enabled,
    } satisfies TvCastSettingMessage)
  } catch {
    // Ignore BroadcastChannel errors in unsupported environments
  }
}

/**
 * Initialize listeners for TV cast status synchronization across tabs and Supabase realtime.
 */
export function initTvCastSettingSync(): () => void {
  const channel = getBroadcastChannel()
  const handleMessage = (event: MessageEvent<TvCastSettingMessage>) => {
    if (event.data?.type === 'TV_CAST_SETTING_CHANGED' && typeof event.data.enabled === 'boolean') {
      useSettingStore.getState().setSystemSettings({ isTvCastEnabled: event.data.enabled })
    }
  }

  channel?.addEventListener('message', handleMessage)

  // Initial fetch from Supabase
  void fetchRemoteTvCastSetting()

  const client = syncClient
  let realtimeChannel: ReturnType<NonNullable<typeof syncClient>['channel']> | null = null
  if (client) {
    realtimeChannel = client
      .channel('site_settings_tv_cast')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_settings',
          filter: 'key=eq.is_tv_cast_enabled',
        },
        payload => {
          const raw = (payload.new as { value?: unknown })?.value
          const parsed = parseSettingValue(raw)
          if (parsed !== null) {
            useSettingStore.getState().setSystemSettings({ isTvCastEnabled: parsed })
          }
        },
      )
      .subscribe()
  }

  return () => {
    channel?.removeEventListener('message', handleMessage)
    if (realtimeChannel && client) {
      void client.removeChannel(realtimeChannel)
    }
  }
}
