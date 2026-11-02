import { describe, expect, it } from 'vitest'
import { buildInviteMessage } from '../lib/watchPartyInvite'

describe('buildInviteMessage', () => {
  it('正确拼接包含邀请人、剧名、集数与链接的 xkaTV 邀请文案', () => {
    const message = buildInviteMessage({
      inviter: 'Nicholas',
      mediaTitle: '繁花',
      episodeTitle: '第 3 集',
      inviteUrl: 'https://example.com/play?partyRoom=room123&inviter=Nicholas',
      mode: 'host_only',
    })

    expect(message).toContain('「Nicholas」邀请你一起看《繁花》 第 3 集！')
    expect(message).toContain('毫秒级同屏同步')
    expect(message).toContain('xkaTV 放映室')
    expect(message).toContain('https://example.com/play?partyRoom=room123&inviter=Nicholas')
  })

  it('免登录专属影厅文案体现免登录秒看特征', () => {
    const message = buildInviteMessage({
      inviter: 'Nicholas',
      mediaTitle: '庆余年',
      episodeTitle: '第 1 集',
      inviteUrl: 'https://example.com/party/room123?inviter=Nicholas',
      mode: 'guest_cinema',
    })

    expect(message).toContain('免登录专属影厅，点开秒看')
    expect(message).toContain('https://example.com/party/room123?inviter=Nicholas')
  })

  it('未提供邀请人时使用通用称呼', () => {
    const message = buildInviteMessage({
      inviter: null,
      mediaTitle: '电影',
      inviteUrl: 'https://example.com/party/room123',
      mode: 'guest_cinema',
    })

    expect(message).toContain('你的好友邀请你一起看《电影》！')
  })
})
