import { z } from 'zod'

const DISCORD_WEBHOOK_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
])

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::\]?$/i,
  /^\[?::1\]?$/i,
  /^\[?::ffff:/i,
  /^\[?fc/i,
  /^\[?fd/i,
  /^\[?fe80:/i,
  /^\d+$/,
  /^0x[0-9a-f]+$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
]

export function isAllowedWebhookUrl(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  if (parsed.username || parsed.password) return false
  const hostname = parsed.hostname.toLowerCase()
  if (!hostname || BLOCKED_HOST_PATTERNS.some(pattern => pattern.test(hostname))) {
    return false
  }
  return true
}

export function isAllowedDiscordWebhookUrl(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (!DISCORD_WEBHOOK_HOSTS.has(parsed.hostname.toLowerCase())) return false
  return /^\/api\/(v\d+\/)?webhooks\/[^/]+\/[^/]+/i.test(parsed.pathname)
}

export const notificationChannelsSchema = z.object({
  enabled: z.boolean().default(false),
  telegram_enabled: z.boolean().default(false),
  telegram_bot_token: z.string().trim().max(256).default(''),
  telegram_chat_id: z.string().trim().max(128).default(''),
  discord_enabled: z.boolean().default(false),
  discord_mode: z.enum(['webhook', 'dm']).default('webhook'),
  discord_webhook_url: z.string().trim().max(2048).default(''),
  discord_bot_token: z.string().trim().max(256).default(''),
  discord_user_id: z.string().trim().max(64).default(''),
  webhook_enabled: z.boolean().default(false),
  webhook_url: z.string().trim().max(2048).default(''),
  webhook_secret: z.string().trim().max(256).default(''),
})

export type NotificationChannelsConfig = z.infer<typeof notificationChannelsSchema>

export const DEFAULT_NOTIFICATION_CHANNELS: NotificationChannelsConfig = {
  enabled: false,
  telegram_enabled: false,
  telegram_bot_token: '',
  telegram_chat_id: '',
  discord_enabled: false,
  discord_mode: 'webhook',
  discord_webhook_url: '',
  discord_bot_token: '',
  discord_user_id: '',
  webhook_enabled: false,
  webhook_url: '',
  webhook_secret: '',
}

export const testNotificationRequestSchema = z.object({
  channel: z.enum(['telegram', 'discord', 'webhook']),
  config: notificationChannelsSchema,
})

export type NotificationChannelType = 'telegram' | 'discord' | 'webhook'

export interface SeriesDigestItem {
  title: string
  sourceCode: string
  vodId: string
  newEpisodes: number[]
  totalEpisodes: number
}

export function formatEpisodeList(episodes: number[]): string {
  const sorted = [...new Set(episodes)].sort((a, b) => a - b)
  if (!sorted.length) return ''
  if (sorted.length === 1) return `第 ${sorted[0]} 集`
  const contiguous = sorted.every((num, idx) => idx === 0 || num === sorted[idx - 1] + 1)
  if (contiguous) {
    return `第 ${sorted[0]}–${sorted[sorted.length - 1]} 集（共 ${sorted.length} 集）`
  }
  const preview = sorted.slice(0, 6).join('、')
  return sorted.length > 6
    ? `第 ${preview} 等 ${sorted.length} 集`
    : `第 ${preview} 集`
}

export function formatDigestText(items: SeriesDigestItem[]): string {
  const lines = ['📺 xkaTV 追剧更新提醒', '']
  for (const item of items) {
    lines.push(`• 《${item.title}》新增 ${formatEpisodeList(item.newEpisodes)}（当前共 ${item.totalEpisodes} 集）`)
  }
  return lines.join('\n')
}

export function validateChannelConfig(
  channel: NotificationChannelType,
  config: NotificationChannelsConfig,
): string | null {
  if (channel === 'telegram') {
    if (!config.telegram_bot_token) return '请先填写 Telegram Bot Token'
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(config.telegram_bot_token)) {
      return 'Telegram Bot Token 格式无效'
    }
    if (!config.telegram_chat_id) return '请先填写 Telegram Chat ID'
    if (!/^-?\d+$|^@[A-Za-z0-9_]{5,}$/.test(config.telegram_chat_id)) {
      return 'Telegram Chat ID 格式无效（应为数字 ID 或 @频道名）'
    }
    return null
  }
  if (channel === 'discord') {
    if (config.discord_mode === 'dm') {
      if (!config.discord_bot_token) return '请先填写 Discord Bot Token'
      if (config.discord_bot_token.length < 20 || /\s/.test(config.discord_bot_token)) {
        return 'Discord Bot Token 格式无效'
      }
      if (!config.discord_user_id) return '请先填写 Discord User ID'
      if (!/^\d{17,22}$/.test(config.discord_user_id)) {
        return 'Discord User ID 格式无效（应为 17–22 位纯数字 ID）'
      }
      return null
    }
    if (!config.discord_webhook_url) return '请先填写 Discord Webhook URL'
    if (!isAllowedDiscordWebhookUrl(config.discord_webhook_url)) {
      return 'Discord Webhook URL 格式无效，应以 https://discord.com/api/webhooks/ 开头'
    }
    return null
  }
  if (!config.webhook_url) return '请先填写自定义 Webhook URL'
  if (!isAllowedWebhookUrl(config.webhook_url)) {
    return 'Webhook URL 必须为合法的公网 HTTP/HTTPS 地址'
  }
  return null
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const endpoint = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'error',
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const rawBody = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(
      `Telegram 推送失败 (HTTP ${response.status})${rawBody ? `: ${rawBody.slice(0, 160)}` : ''}`,
    )
  }
  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody) as { ok?: boolean; description?: string }
      if (parsed.ok === false) {
        throw new Error(`Telegram 推送失败: ${parsed.description || '未知错误'}`)
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Telegram 推送失败:')) {
        throw err
      }
    }
  }
}

export async function sendDiscordWebhook(
  webhookUrl: string,
  title: string,
  description: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!isAllowedDiscordWebhookUrl(webhookUrl)) {
    throw new Error('Discord Webhook URL 无效')
  }
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'error',
    body: JSON.stringify({
      username: 'xkaTV 追剧提醒',
      embeds: [
        {
          title,
          description,
          color: 0xef4444,
          timestamp: new Date().toISOString(),
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Discord 推送失败 (HTTP ${response.status})${body ? `: ${body.slice(0, 160)}` : ''}`)
  }
}

export async function sendDiscordDm(
  botToken: string,
  userId: string,
  title: string,
  description: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!botToken.trim() || !/^\d{17,22}$/.test(userId.trim())) {
    throw new Error('Discord Bot Token 或 User ID 无效')
  }
  const authHeaders = {
    Authorization: `Bot ${botToken.trim()}`,
    'Content-Type': 'application/json',
    'User-Agent': 'xkaTV-SeriesNotifier/1.0',
  }

  const dmRes = await fetchImpl('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: authHeaders,
    redirect: 'error',
    body: JSON.stringify({ recipient_id: userId.trim() }),
    signal: AbortSignal.timeout(10_000),
  })
  const dmBody = await dmRes.text().catch(() => '')
  if (!dmRes.ok) {
    if (dmRes.status === 401) throw new Error('Discord Bot Token 无效或已失效')
    throw new Error(
      `创建 Discord 私信频道失败 (HTTP ${dmRes.status})${dmBody ? `: ${dmBody.slice(0, 160)}` : ''}`,
    )
  }

  let channelId = ''
  try {
    const parsed = JSON.parse(dmBody) as { id?: string }
    channelId = String(parsed.id || '').trim()
  } catch {
    channelId = ''
  }
  if (!channelId) {
    throw new Error('Discord 未返回有效的私信频道 ID')
  }

  const msgRes = await fetchImpl(
    `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`,
    {
      method: 'POST',
      headers: authHeaders,
      redirect: 'error',
      body: JSON.stringify({
        embeds: [
          {
            title,
            description,
            color: 0xef4444,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!msgRes.ok) {
    const body = await msgRes.text().catch(() => '')
    if (msgRes.status === 403) {
      throw new Error(
        'Discord 拒绝发送私信 (HTTP 403)：请确认你的 Bot 与你在同一个服务器中，且已开启允许服务器成员私信',
      )
    }
    throw new Error(
      `Discord 私信发送失败 (HTTP ${msgRes.status})${body ? `: ${body.slice(0, 160)}` : ''}`,
    )
  }
}

export async function sendGenericWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>,
  secret?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!isAllowedWebhookUrl(webhookUrl)) {
    throw new Error('Webhook URL 无效')
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'xkaTV-SeriesNotifier/1.0',
  }
  if (secret?.trim()) {
    headers['X-Webhook-Secret'] = secret.trim()
  }
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers,
    redirect: 'error',
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Webhook 推送失败 (HTTP ${response.status})${body ? `: ${body.slice(0, 160)}` : ''}`)
  }
}
