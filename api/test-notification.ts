import type { ApiRequest, ApiResponse } from '../shared/serverless-http.js'
import { createClient } from '@supabase/supabase-js'
import { accountSchema } from '../shared/account-rules.js'
import {
  sendDiscordWebhook,
  sendGenericWebhook,
  sendTelegramMessage,
  testNotificationRequestSchema,
  validateChannelConfig,
} from '../shared/notification-channels.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) return res.status(401).json({ error: '请先登录' })

  const url = process.env.XKA_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.XKA_SUPABASE_ANON_KEY || process.env.XKA_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return res.status(503).json({ error: '账号服务尚未配置完成' })

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await client.rpc('current_account')
  if (error) return res.status(401).json({ error: '登录已失效，请重新登录' })

  const account = accountSchema.safeParse(data?.[0])
  if (!account.success || !account.data.enabled) {
    return res.status(403).json({ error: '账号不可用' })
  }

  if (account.data.role !== 'admin') {
    const access = await client.rpc('account_is_active')
    if (access.error) return res.status(503).json({ error: '暂时无法确认网站状态' })
    if (access.data !== true) {
      res.setHeader('Retry-After', '15')
      return res.status(503).json({ error: '网站维护中，请稍后再试', maintenance: true })
    }
  }

  const parsed = testNotificationRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: '推送配置参数无效' })
  }

  const { channel, config } = parsed.data
  const validationError = validateChannelConfig(channel, config)
  if (validationError) {
    return res.status(400).json({ error: validationError })
  }

  try {
    const nowText = new Date().toLocaleString('zh-CN', { hour12: false })
    const message = `📺 xkaTV 测试通知\n\n账号「${account.data.username}」已成功连接追剧推送通道。\n发送时间：${nowText}`

    if (channel === 'telegram') {
      await sendTelegramMessage(config.telegram_bot_token, config.telegram_chat_id, message)
    } else if (channel === 'discord') {
      await sendDiscordWebhook(
        config.discord_webhook_url,
        '📺 xkaTV 测试通知',
        `账号「${account.data.username}」已成功连接 Discord 追剧推送通道。\n发送时间：${nowText}`,
      )
    } else {
      await sendGenericWebhook(
        config.webhook_url,
        {
          event: 'series.update.test',
          app: 'xkaTV',
          username: account.data.username,
          message,
          sentAt: new Date().toISOString(),
        },
        config.webhook_secret,
      )
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : '测试通知发送失败',
    })
  }
}
