// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const alice = '00000000-0000-4000-8000-000000000001'
const bob = '00000000-0000-4000-8000-000000000002'
const migration = readFileSync(
  new URL('../supabase/migrations/202610190001_series_notifications.sql', import.meta.url),
  'utf8',
)
let db: PGlite
const change = (
  knownEpisodes: number[],
  baselineEpisodes = [1, 2],
  readEpisodes: number[] = [],
  trackingKey = 'favorite::1',
) => {
  const data = {
    trackingKey,
    bindingKey: 'auto',
    sourceCode: 'source',
    vodId: 'video',
    resourceSignature: 'hash',
  }
  return {
    ...data,
    resourceKey: JSON.stringify([
      data.trackingKey,
      data.bindingKey,
      data.sourceCode,
      data.vodId,
      data.resourceSignature,
    ]),
    knownEpisodes,
    baselineEpisodes,
    readEpisodes,
  }
}
const key = change([1, 2]).resourceKey
async function asUser(id: string, active = true) {
  await db.exec('reset role; set role authenticated')
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, false), set_config('test.active', $2, false)",
    [id, String(active)],
  )
}
async function sync(changes: ReturnType<typeof change>[], keys = [key]) {
  const result = await db.query<{
    value: { knownEpisodes: number[]; readEpisodes: number[]; resourceKey: string }[]
  }>(
    'select public.sync_series_notifications($1::jsonb, array(select jsonb_array_elements_text($2::jsonb))) as value',
    [JSON.stringify(changes), JSON.stringify(keys)],
  )
  return result.rows[0].value
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${alice}'), ('${bob}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create function public.account_is_active() returns boolean language sql stable as $$
      select coalesce(current_setting('test.active', true), 'false') = 'true';
    $$;
    grant usage on schema auth to authenticated;
  `)
  await db.exec(migration)
}, 45000)
beforeEach(async () => {
  await db.exec('reset role; truncate public.series_notifications')
  await asUser(alice)
})
afterAll(async () => {
  await db?.close()
})

describe('提醒同步 PostgreSQL RPC', () => {
  it('只创建一次基准，新设备首次看到更多集数不会清空云端未读', async () => {
    await sync([change([1, 2])])
    await sync([change([1, 2, 3])])
    const rows = await sync([change([1, 2, 3, 4], [1, 2, 3, 4])])
    expect(rows[0].knownEpisodes).toEqual([1, 2, 3, 4])
    expect(rows[0].readEpisodes).toEqual([1, 2])
  })

  it.each([true, false])(
    '交错合并新集与旧快照已读，保留新到达的第4集（顺序 %s）',
    async reverse => {
      await sync([change([1, 2])])
      const operations = [change([1, 2, 3, 4]), change([1, 2, 3], [1, 2], [3])]
      if (reverse) operations.reverse()
      for (const operation of operations) await sync([operation])
      const [row] = await sync([])
      expect(row.knownEpisodes).toEqual([1, 2, 3, 4])
      expect(row.readEpisodes).toEqual([1, 2, 3])
      await sync([change([1, 2, 3], [1, 2, 3])])
      expect((await sync([]))[0].readEpisodes).toEqual([1, 2, 3])
    },
  )

  it('首次迁移保留已有本机未读，重复上传完全幂等', async () => {
    const data = change([1, 2, 3, 4], [1, 2])
    expect((await sync([data]))[0].readEpisodes).toEqual([1, 2])
    expect(await sync([data])).toEqual(await sync([]))
  })

  it('账号读取和写入隔离，不能直接绕过RPC修改已读数组', async () => {
    await sync([change([1, 2, 3])])
    await asUser(bob)
    expect(await sync([])).toEqual([])
    await sync([change([1, 2, 3], [1, 2, 3])])
    expect((await db.query('select * from public.series_notifications')).rows).toHaveLength(1)
    await expect(
      db.query('update public.series_notifications set read_episodes = known_episodes'),
    ).rejects.toThrow(/permission denied/)
    await asUser(alice)
    expect((await sync([]))[0].readEpisodes).toEqual([1, 2])
  })

  it('禁用账号和匿名用户不能访问RPC或其他账号的提醒', async () => {
    await sync([change([1, 2])])
    await asUser(alice, false)
    await expect(sync([])).rejects.toThrow('Inactive account')
    expect((await db.query('select * from public.series_notifications')).rows).toHaveLength(0)
    await db.exec('reset role; set role anon')
    await expect(sync([])).rejects.toThrow(/permission denied/)
  })

  it.each([0, -1, 1.5, 10000, '1'])('拒绝非法集数 %j', async number => {
    await expect(
      sync([{ ...change([1, 2]), knownEpisodes: [number] as number[] }]),
    ).rejects.toThrow('Invalid episode number')
  })

  it('校验资源身份及已读范围，失败时整批回滚', async () => {
    await sync([change([1, 2])])
    await expect(sync([change([1, 2, 3]), change([1, 2], [1, 2], [3])])).rejects.toThrow(
      'Receipts must refer to observed episodes',
    )
    expect((await sync([]))[0].knownEpisodes).toEqual([1, 2])
    await expect(sync([{ ...change([1, 2]), vodId: 'another-video' }])).rejects.toThrow(
      'Resource identity mismatch',
    )
    await expect(sync(Array.from({ length: 26 }, () => change([1, 2])))).rejects.toThrow(
      'Expected at most 25 resources',
    )
  })

  it('长资源标识使用固定长度哈希索引，迁移可重复执行', async () => {
    const data = change([1, 2], [1, 2], [], 'favorite-' + 'x'.repeat(1900))
    const long = { ...data, bindingKey: 'b'.repeat(1500) }
    long.resourceKey = JSON.stringify([
      long.trackingKey,
      long.bindingKey,
      long.sourceCode,
      long.vodId,
      long.resourceSignature,
    ])
    expect(long.resourceKey.length).toBeGreaterThan(3000)
    expect((await sync([long], [long.resourceKey]))[0].resourceKey).toBe(long.resourceKey)
    await db.exec('reset role')
    await db.exec(migration)
    await asUser(alice)
    expect(await sync([], [long.resourceKey])).toHaveLength(1)
  })
})
