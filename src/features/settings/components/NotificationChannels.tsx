import { useEffect, useState } from 'react'
import { Bell, Loader2, Save, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'
import { SettingsItem, SettingsSection } from './common'
import {
  DEFAULT_NOTIFICATION_CHANNELS,
  notificationChannelsSchema,
  validateChannelConfig,
  type NotificationChannelType,
  type NotificationChannelsConfig,
} from '../../../../shared/notification-channels'

const TABLE_MISSING_CODES = new Set(['42P01', 'PGRST205'])

export default function NotificationChannels() {
  const account = useAuthStore(state => state.account)
  const [config, setConfig] = useState<NotificationChannelsConfig>(DEFAULT_NOTIFICATION_CHANNELS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<NotificationChannelType | null>(null)
  const [migrationMissing, setMigrationMissing] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      if (!syncClient || !account?.id) {
        if (active) setLoading(false)
        return
      }
      setLoading(true)
      setMigrationMissing(false)
      try {
        const { data, error } = await syncClient
          .from('user_notification_channels')
          .select(
            'enabled,telegram_enabled,telegram_bot_token,telegram_chat_id,discord_enabled,discord_mode,discord_webhook_url,discord_bot_token,discord_user_id,webhook_enabled,webhook_url,webhook_secret',
          )
          .eq('user_id', account.id)
          .maybeSingle()

        if (!active) return
        if (error) {
          if (TABLE_MISSING_CODES.has(error.code ?? '')) {
            setMigrationMissing(true)
          } else {
            toast.error(`加载推送配置失败：${error.message}`)
          }
          return
        }
        if (data) {
          const parsed = notificationChannelsSchema.safeParse(data)
          if (parsed.success) {
            setConfig(parsed.data)
          }
        } else {
          setConfig(DEFAULT_NOTIFICATION_CHANNELS)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [account?.id])

  function update(patch: Partial<NotificationChannelsConfig>) {
    setConfig(prev => ({ ...prev, ...patch }))
  }

  async function handleSave() {
    if (!syncClient || !account?.id || saving) return

    if (config.enabled) {
      const checks: NotificationChannelType[] = []
      if (config.telegram_enabled) checks.push('telegram')
      if (config.discord_enabled) checks.push('discord')
      if (config.webhook_enabled) checks.push('webhook')
      if (checks.length === 0) {
        toast.error('请至少启用一个推送通道（Telegram、Discord 或自定义 Webhook）')
        return
      }
      for (const ch of checks) {
        const err = validateChannelConfig(ch, config)
        if (err) {
          toast.error(err)
          return
        }
      }
    }

    setSaving(true)
    try {
      const payload = notificationChannelsSchema.parse(config)
      const { error } = await syncClient.from('user_notification_channels').upsert(
        {
          user_id: account.id,
          ...payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      if (error) {
        if (TABLE_MISSING_CODES.has(error.code ?? '')) {
          setMigrationMissing(true)
          toast.error('数据库尚未执行推送通知迁移脚本')
          return
        }
        throw new Error(error.message)
      }
      setConfig(payload)
      toast.success('推送通知设置已保存')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存推送设置失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(channel: NotificationChannelType) {
    if (!syncClient || testing) return
    const validationError = validateChannelConfig(channel, config)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setTesting(channel)
    try {
      const session = await syncClient.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) throw new Error('登录已失效，请重新登录')

      const response = await fetch('/api/test-notification', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel, config }),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(result.error || `测试推送失败 (HTTP ${response.status})`)
      }
      const labels: Record<NotificationChannelType, string> = {
        telegram: 'Telegram',
        discord: 'Discord',
        webhook: 'Webhook',
      }
      toast.success(`${labels[channel]} 测试通知已发送，请查收`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '测试通知发送失败')
    } finally {
      setTesting(null)
    }
  }

  if (!syncClient || !account) return null

  return (
    <SettingsSection
      title="追剧外部推送"
      icon={<Bell className="size-4" />}
      tone="amber"
      description="后台定时检查已追更剧集，发现新集时自动推送至 Telegram、Discord 或自定义 Webhook。"
    >
      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          <span>正在加载推送设置…</span>
        </div>
      ) : migrationMissing ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
          {account.role === 'admin' ? (
            <>
              当前数据库尚未创建推送配置表。请在 Supabase SQL Editor 中执行{' '}
              <code className="font-mono">202611270001_series_push_notifications.sql</code> 后刷新页面。
            </>
          ) : (
            '追剧外部推送暂未开放，请联系管理员。'
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <SettingsItem
            title="启用追剧外部推送"
            description="开启后，定时任务检测到你追更的剧集有新集时会按下方启用的通道合并推送。"
            controlClassName="self-end mt-1"
            control={
              <Switch
                checked={config.enabled}
                onCheckedChange={checked => update({ enabled: checked })}
              />
            }
          />

          {/* Telegram */}
          <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Telegram</p>
                <p className="text-muted-foreground text-xs">
                  通过 @BotFather 创建 Bot 并获取 Token 与目标 Chat ID。
                </p>
              </div>
              <Switch
                checked={config.telegram_enabled}
                onCheckedChange={checked => update({ telegram_enabled: checked })}
              />
            </div>
            {config.telegram_enabled && (
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs">
                  <span className="text-muted-foreground">Bot Token</span>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="123456789:AAH..."
                    value={config.telegram_bot_token}
                    onChange={e => update({ telegram_bot_token: e.target.value })}
                  />
                </label>
                <label className="space-y-1.5 text-xs">
                  <span className="text-muted-foreground">Chat ID</span>
                  <Input
                    type="text"
                    autoComplete="off"
                    placeholder="123456789 或 @channel_name"
                    value={config.telegram_chat_id}
                    onChange={e => update({ telegram_chat_id: e.target.value })}
                  />
                </label>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={testing !== null}
                    onClick={() => void handleTest('telegram')}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {testing === 'telegram' ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    发送 Telegram 测试
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Discord */}
          <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Discord</p>
                <p className="text-muted-foreground text-xs">
                  支持频道 Webhook 或通过你自己的 Bot 发送私信（DM）。
                </p>
              </div>
              <Switch
                checked={config.discord_enabled}
                onCheckedChange={checked => update({ discord_enabled: checked })}
              />
            </div>
            {config.discord_enabled && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={config.discord_mode === 'webhook' ? 'default' : 'outline'}
                    onClick={() => update({ discord_mode: 'webhook' })}
                    className="h-7 rounded-full px-3 text-xs"
                  >
                    频道 Webhook
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={config.discord_mode === 'dm' ? 'default' : 'outline'}
                    onClick={() => update({ discord_mode: 'dm' })}
                    className="h-7 rounded-full px-3 text-xs"
                  >
                    私信（DM）
                  </Button>
                </div>

                {config.discord_mode === 'webhook' ? (
                  <label className="block space-y-1.5 text-xs">
                    <span className="text-muted-foreground">Webhook URL</span>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={config.discord_webhook_url}
                      onChange={e => update({ discord_webhook_url: e.target.value })}
                    />
                  </label>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-xs">
                      <span className="text-muted-foreground">Bot Token</span>
                      <Input
                        type="password"
                        autoComplete="off"
                        placeholder="Discord Developer Portal Bot Token"
                        value={config.discord_bot_token}
                        onChange={e => update({ discord_bot_token: e.target.value })}
                      />
                    </label>
                    <label className="space-y-1.5 text-xs">
                      <span className="text-muted-foreground">Discord User ID</span>
                      <Input
                        type="text"
                        autoComplete="off"
                        placeholder="17–22 位纯数字用户 ID"
                        value={config.discord_user_id}
                        onChange={e => update({ discord_user_id: e.target.value })}
                      />
                    </label>
                    <p className="text-muted-foreground text-xs sm:col-span-2">
                      需确保该 Bot 与你至少在一个共同服务器中，并在隐私设置中允许接收服务器成员私信。
                    </p>
                  </div>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={testing !== null}
                  onClick={() => void handleTest('discord')}
                  className="h-8 gap-1.5 text-xs"
                >
                  {testing === 'discord' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  发送 Discord 测试
                </Button>
              </div>
            )}
          </div>

          {/* Generic Webhook */}
          <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">自定义 Webhook</p>
                <p className="text-muted-foreground text-xs">
                  向任意公网 URL 发送 JSON POST（兼容 n8n、Bark 中转、企业微信/飞书机器人桥接等）。
                </p>
              </div>
              <Switch
                checked={config.webhook_enabled}
                onCheckedChange={checked => update({ webhook_enabled: checked })}
              />
            </div>
            {config.webhook_enabled && (
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs sm:col-span-2">
                  <span className="text-muted-foreground">Webhook URL</span>
                  <Input
                    type="url"
                    autoComplete="off"
                    placeholder="https://example.com/webhook/xkatv"
                    value={config.webhook_url}
                    onChange={e => update({ webhook_url: e.target.value })}
                  />
                </label>
                <label className="space-y-1.5 text-xs sm:col-span-2">
                  <span className="text-muted-foreground">
                    签名密钥（可选，通过 X-Webhook-Secret 请求头发送）
                  </span>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="留空则不发送密钥头"
                    value={config.webhook_secret}
                    onChange={e => update({ webhook_secret: e.target.value })}
                  />
                </label>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={testing !== null}
                    onClick={() => void handleTest('webhook')}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {testing === 'webhook' ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    发送 Webhook 测试
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-full px-5 font-medium shadow-xs"
            >
              {saving ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 size-4" />
              )}
              {saving ? '保存中…' : '保存推送设置'}
            </Button>
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
