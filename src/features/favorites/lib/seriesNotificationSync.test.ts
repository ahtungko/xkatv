import { describe, expect, it } from 'vitest'
import {
  localNotificationSchema,
  notificationIdentity,
  notificationNeedsSync,
  notificationView,
  parseNotificationAccounts,
} from './seriesNotificationSync'
import type { SeriesUpdate } from './seriesTracking'

function row(vodId: number | string, known = [1, 2, 3]) {
  const bindingKey = JSON.stringify(['source', vodId])
  const resourceKey = JSON.stringify(['favorite::1', bindingKey, 'source', vodId, 'hash'])
  return {
    trackingKey: 'favorite::1',
    bindingKey,
    sourceCode: 'source',
    vodId,
    resourceSignature: 'hash',
    resourceKey,
    knownEpisodes: known,
    baselineEpisodes: [1, 2],
    readEpisodes: [3],
    syncedKnownEpisodes: [],
    syncedReadEpisodes: [],
  }
}

describe('提醒缓存兼容与隔离恢复', () => {
  it('复合键迁移后重新上传，以已确认收据建立基准，不能把云端未读变成已读', () => {
    const old = {
      ...row('83519', [1, 2, 3, 4]),
      bindingKey: JSON.stringify(['source', 83519]),
      baselineEpisodes: [1, 2, 3, 4],
      readEpisodes: [1, 2],
      syncedKnownEpisodes: [1, 2, 3, 4],
      syncedReadEpisodes: [1, 2],
    }
    old.resourceKey = JSON.stringify([
      old.trackingKey,
      old.bindingKey,
      old.sourceCode,
      old.vodId,
      old.resourceSignature,
    ])
    const migrated = Object.values(
      parseNotificationAccounts({ alice: { [old.resourceKey]: old } }).alice,
    )[0]
    expect(migrated).toMatchObject({
      baselineEpisodes: [1, 2],
      syncedKnownEpisodes: [],
      syncedReadEpisodes: [],
    })
    expect(notificationNeedsSync(migrated)).toBe(true)
    expect(notificationView(migrated).unreadEpisodes).toEqual([3, 4])
  })

  it('数字和字符串形式的同一资源合并，保留待上传已读及确认状态', () => {
    const numeric = row(83519)
    const text = {
      ...row('83519', [1, 2, 3, 4]),
      readEpisodes: [4],
      syncedKnownEpisodes: [1, 2],
      syncedReadEpisodes: [],
    }
    const parsed = parseNotificationAccounts({
      alice: { [numeric.resourceKey]: numeric, [text.resourceKey]: text },
    })
    expect(Object.keys(parsed.alice)).toEqual([text.resourceKey])
    const migrated = parsed.alice[text.resourceKey]
    expect(localNotificationSchema.safeParse(migrated).success).toBe(true)
    expect(migrated).toMatchObject({
      vodId: '83519',
      knownEpisodes: [1, 2, 3, 4],
      readEpisodes: [3, 4],
      syncedKnownEpisodes: [1, 2],
    })
    expect(notificationNeedsSync(migrated)).toBe(true)
  })

  it('隔离坏记录，保留同账号和其他账号的有效收据', () => {
    const valid = row('83519')
    const invalid = { ...row('bad'), knownEpisodes: ['1'] }
    const parsed = parseNotificationAccounts({
      alice: { [valid.resourceKey]: valid, [invalid.resourceKey]: invalid, forged: valid },
      bob: { [valid.resourceKey]: valid },
      broken: null,
    })
    expect(Object.keys(parsed.alice)).toEqual([valid.resourceKey])
    expect(parsed.bob[valid.resourceKey].readEpisodes).toEqual([3])
    expect(parsed.broken).toBeUndefined()
  })

  it('生成提醒身份时兼容旧检查结果，同时规范化复合绑定键', () => {
    const numeric = row(83519)
    const identity = notificationIdentity('favorite::1', {
      attemptedAt: 1,
      checkedAt: 1,
      sourceCode: 'source',
      vodId: 83519,
      bindingKey: numeric.bindingKey,
      resourceSignature: 'hash',
      episodes: [{ index: 0, number: 1 }],
    } as unknown as SeriesUpdate)
    expect(identity?.resourceKey).toBe(row('83519').resourceKey)
    expect(identity?.vodId).toBe('83519')
  })

  it('损坏的顶层缓存不向登录状态传播异常', () => {
    for (const value of [null, 'broken', [], 123])
      expect(parseNotificationAccounts(value)).toEqual({})
  })
})
