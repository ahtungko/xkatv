import { createClient } from '@supabase/supabase-js'
import { accountSchema } from '../../shared/account-rules.js'
import {
  sendDiscordWebhook,
  sendGenericWebhook,
  sendTelegramMessage,
  testNotificationRequestSchema,
  validateChannelConfig,
} from '../../shared/notification-channels.js'

interface Env {
  XKA_SUPABASE_URL?: string
  SUPABASE_URL?: string
  XKA_SUPABASE_ANON_KEY?: string
  XKA_SUPABASE_PUBLISHABLE_KEY?: string
  [key: string]: unknown
}

interface Context {
  request: Request
  env: Env
  params: unknown
}

const noStoreHeaders = {
  'Cache-Control': 'private, no-store',
}

export const onRequest = async (context: Context): Promise<Response> => {
  if (context.request.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: { ...noStoreHeaders, Allow: 'POST' } },
    )
  }

  const token = context.request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) {
    return Response.json({ error: '请先登录' }, { status: 401, headers: noStoreHeaders })
  }

  const env = context.env || {}
  const url = env.XKA_SUPABASE_URL || env.SUPABASE_URL
  const key = env.XKA_SUPABASE_ANON_KEY || env.XKA_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    return Response.json({ error: '账号服务尚未配置完成' }, { status: 503, headers: noStoreHeaders })
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await client.rpc('current_account')
  if (error) {
    return Response.json({ error: '登录已失效，请重新登录' }, { status: 401, headers: noStoreHeaders })
  }

  const account = accountSchema.safeParse(data?.[0])
  if (!account.success || !account.data.enabled) {
    return Response.json({ error: '账号不可用' }, { status: 403, headers: noStoreHeaders })
  }

  if (account.data.role !== 'admin') {
    const access = await client.rpc('account_is_active')
    if (access.error) {
      return Response.json({ error: '暂时无法确认网站状态' }, { status: 503, headers: noStoreHeaders })
    }
    if (access.data !== true) {
      return Response.json(
        { error: '网站维护中，请稍后再试', maintenance: true },
        { status: 503, headers: { ...noStoreHeaders, 'Retry-After': '15' } },
      )
    }
  }

  let body: unknown
  try {
    body = await context.request.json()
  } catch {
    return Response.json({ error: '请求格式无效' }, { status: 400, headers: noStoreHeaders })
  }

  const parsed = testNotificationRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: '推送配置参数无效' }, { status: 400, headers: noStoreHeaders })
  }

  const { channel, config } = parsed.data
  const validationError = validateChannelConfig(channel, config)
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400, headers: noStoreHeaders })
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

    return Response.json({ ok: true }, { status: 200, headers: noStoreHeaders })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '测试通知发送失败' },
      { status: 502, headers: noStoreHeaders },
    )
  }
}
