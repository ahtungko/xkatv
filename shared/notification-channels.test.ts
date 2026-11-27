import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NOTIFICATION_CHANNELS,
  formatDigestText,
  formatEpisodeList,
  isAllowedDiscordWebhookUrl,
  isAllowedWebhookUrl,
  sendDiscordWebhook,
  sendGenericWebhook,
  sendTelegramMessage,
  validateChannelConfig,
} from './notification-channels'

describe('notification-channels validation', () => {
  it('validates discord webhook urls strictly', () => {
    expect(isAllowedDiscordWebhookUrl('https://discord.com/api/webhooks/12345/abcdef')).toBe(true)
    expect(isAllowedDiscordWebhookUrl('https://ptb.discord.com/api/v10/webhooks/123/xyz')).toBe(true)
    expect(isAllowedDiscordWebhookUrl('http://discord.com/api/webhooks/12345/abcdef')).toBe(false)
    expect(isAllowedDiscordWebhookUrl('https://evil.com/api/webhooks/12345/abcdef')).toBe(false)
    expect(isAllowedDiscordWebhookUrl('https://discord.com/channels/1/2')).toBe(false)
  })

  it('blocks private, local, CGNAT, and mapped IPv6 webhook urls against SSRF', () => {
    expect(isAllowedWebhookUrl('https://hooks.example.com/xkatv')).toBe(true)
    expect(isAllowedWebhookUrl('http://localhost:8080/hook')).toBe(false)
    expect(isAllowedWebhookUrl('http://foo.localhost/hook')).toBe(false)
    expect(isAllowedWebhookUrl('http://127.0.0.1/hook')).toBe(false)
    expect(isAllowedWebhookUrl('http://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isAllowedWebhookUrl('http://192.168.1.10/hook')).toBe(false)
    expect(isAllowedWebhookUrl('http://10.0.0.5/hook')).toBe(false)
    expect(isAllowedWebhookUrl('http://100.64.0.1/hook')).toBe(false)
    expect(isAllowedWebhookUrl('http://[::ffff:127.0.0.1]/hook')).toBe(false)
    expect(isAllowedWebhookUrl('http://2130706433/hook')).toBe(false)
    expect(isAllowedWebhookUrl('https://user:pass@example.com/hook')).toBe(false)
  })

  it('validates telegram, discord, and webhook channel configs', () => {
    expect(validateChannelConfig('telegram', DEFAULT_NOTIFICATION_CHANNELS)).toContain('Bot Token')
    expect(
      validateChannelConfig('telegram', {
        ...DEFAULT_NOTIFICATION_CHANNELS,
        telegram_bot_token: '123456789:AAH_valid_bot_token_123456789',
        telegram_chat_id: '-1001234567890',
      }),
    ).toBeNull()
    expect(
      validateChannelConfig('discord', {
        ...DEFAULT_NOTIFICATION_CHANNELS,
        discord_webhook_url: 'https://discord.com/api/webhooks/123/token',
      }),
    ).toBeNull()
    expect(
      validateChannelConfig('webhook', {
        ...DEFAULT_NOTIFICATION_CHANNELS,
        webhook_url: 'https://example.com/notify',
      }),
    ).toBeNull()
  })
})

describe('notification-channels formatting and delivery', () => {
  it('formats single, contiguous, and non-contiguous episode lists', () => {
    expect(formatEpisodeList([5])).toBe('第 5 集')
    expect(formatEpisodeList([10, 11, 12])).toBe('第 10–12 集（共 3 集）')
    expect(formatEpisodeList([2, 4, 7])).toBe('第 2、4、7 集')
  })

  it('formats digest text for multiple series', () => {
    const text = formatDigestText([
      { title: '庆余年', sourceCode: 'src1', vodId: '100', newEpisodes: [21, 22], totalEpisodes: 22 },
      { title: '三体', sourceCode: 'src1', vodId: '200', newEpisodes: [8], totalEpisodes: 8 },
    ])
    expect(text).toContain('《庆余年》新增 第 21–22 集（共 2 集）')
    expect(text).toContain('《三体》新增 第 8 集（当前共 8 集）')
  })

  it('sends telegram, discord, and generic webhook requests with redirect protection', async () => {
    const mockFetch = vi.fn().mockImplementation(async () => Response.json({ ok: true }))
    await sendTelegramMessage('123:AAH_valid_bot_token_123456789', '999', 'hello', mockFetch)
    await sendDiscordWebhook('https://discord.com/api/webhooks/1/abc', 'Title', 'Desc', mockFetch)
    await sendGenericWebhook('https://example.com/hook', { ok: true }, 'sec123', mockFetch)

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(mockFetch.mock.calls[0][0]).toContain('https://api.telegram.org/bot')
    expect((mockFetch.mock.calls[0][1] as RequestInit).redirect).toBe('error')
    expect((mockFetch.mock.calls[1][1] as RequestInit).redirect).toBe('error')
    expect((mockFetch.mock.calls[2][1] as RequestInit).redirect).toBe('error')
    expect((mockFetch.mock.calls[2][1] as RequestInit).headers).toMatchObject({
      'X-Webhook-Secret': 'sec123',
    })
  })

  it('throws if Telegram returns 200 with ok=false', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(Response.json({ ok: false, description: 'chat not found' }))
    await expect(
      sendTelegramMessage('123:AAH_valid_bot_token_123456789', '999', 'hello', mockFetch),
    ).rejects.toThrow('chat not found')
  })
})
