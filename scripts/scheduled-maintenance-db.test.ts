// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const admin = '00000000-0000-4000-8000-000000000001'
const user = '00000000-0000-4000-8000-000000000002'
const sid = (id: string) => id.replace('00000000-', '10000000-')
const migration = (name: string) =>
  readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const maintenanceMigration = migration('202610200003_scheduled_maintenance')
const optionalContentMigration = migration('202610220001_optional_announcement_content')
const publicStatusMigration = migration('202610250001_public_maintenance_status')
let db: PGlite
async function asUser(id: string) {
  await db.exec('reset role; set role authenticated')
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
    [id, JSON.stringify({ session_id: sid(id) })],
  )
}
async function active() {
  return (await db.query<{ value: boolean }>('select public.account_is_active() as value')).rows[0]
    .value
}
async function window(
  start = "clock_timestamp() - interval '1 hour'",
  end = "clock_timestamp() + interval '1 hour'",
) {
  await db.exec(`reset role; update public.site_announcement set title = '维护中', content = '服务升级',
    published = true, kind = 'maintenance', maintenance_start = ${start}, maintenance_end = ${end}, revision = 0`)
}
async function save(start: string | null, end: string | null, published = true) {
  return (
    await db.query<{ value: unknown }>(
      "select public.save_site_announcement('维护公告', '内容', $1, 0, 'maintenance', null, $2::timestamptz, $3::timestamptz) as value",
      [published, start, end],
    )
  ).rows[0].value
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, raw_app_meta_data jsonb);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users, created_at timestamptz not null);
    insert into auth.users(id) values ('${admin}'), ('${user}');
    insert into auth.sessions values ('${sid(admin)}', '${admin}', now() - interval '1 hour'), ('${sid(user)}', '${user}', now() - interval '1 hour');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb; $$;
    grant usage on schema auth to authenticated;
  `)
  for (const name of [
    '202610010001_user_sync',
    '202610010002_managed_accounts',
    '202610010003_account_provisioning_fix',
    '202610020001_admin_dashboard',
    '202610020002_nsfw_access',
    '202610030001_playback_lease',
    '202610190001_series_notifications',
    '202610200001_site_announcement',
    '202610200002_announcement_types',
  ])
    await db.exec(migration(name))
  await db.exec(
    `insert into public.user_accounts(id, username, role) values ('${admin}', 'admin', 'admin'), ('${user}', 'user', 'user')`,
  )
  await db.exec(maintenanceMigration)
  await db.exec(optionalContentMigration)
  await db.exec(publicStatusMigration)
  await db.exec(migration('202610290002_private_playback_lease'))
}, 45000)
beforeEach(async () => {
  await db.exec(`reset role;
    update public.site_announcement set published = false, kind = 'notice', title = '', content = '', revision = 0, maintenance_start = null, maintenance_end = null, version_label = null;
    update public.user_accounts set enabled = true, sessions_valid_after = '-infinity';
    truncate public.user_sync_records, public.account_playback, public.series_notifications;
    insert into public.user_sync_records(user_id, kind, item_key, value, modified_at, mutation_id) values
      ('${user}', 'favorite', 'test', '{}', 1, 'a'), ('${admin}', 'favorite', 'test', '{}', 1, 'a');
  `)
  await asUser(user)
})
afterAll(async () => {
  await db?.close()
})

describe('定时维护的真实数据库权限', () => {
  it('updates a live lease when private playback is enabled and disabled', async () => {
    const player = '20000000-0000-4000-8000-000000000001'
    const acquire = await db.query<{ value: { lease_id: string } }>(
      "select public.playback_lease('acquire', $1::uuid, p_media_key => 'episode', p_title => 'Title', p_position => 12) as value",
      [player],
    )
    const lease = acquire.rows[0].value.lease_id
    const renew = async (key: string, title: string, position: number) => db.query<{ value: { media_key: string } }>(
      "select public.playback_lease('renew', $1::uuid, p_lease => $2::uuid, p_media_key => $3, p_title => $4, p_position => $5) as value",
      [player, lease, key, title, position],
    )
    expect((await renew('private:random', '无痕播放', 0)).rows[0].value.media_key).toBe('private:random')
    await db.exec('reset role')
    expect((await db.query('select media_key, title, position from public.account_playback')).rows[0]).toMatchObject({ media_key: 'private:random', title: '无痕播放', position: 0 })
    await asUser(user)
    expect((await renew('episode', 'Title', 50)).rows[0].value.media_key).toBe('episode')
    const changes = [{ kind: 'history', item_key: 'episode', value: { playbackLeaseId: lease }, modified_at: 100, mutation_id: 'private-transition', deleted: false }]
    await expect(db.query('select public.sync_user_records($1::jsonb)', [JSON.stringify(changes)])).resolves.toBeDefined()
  })

  it('匿名访客只能获取公开维护投影，不能读取账号、公告表或已登录接口', async () => {
    await window()
    await db.exec('reset role; set role anon')
    const result = (
      await db.query<{ value: Record<string, unknown> }>(
        'select public.get_public_site_maintenance_status() as value',
      )
    ).rows[0].value
    expect(Object.keys(result).sort()).toEqual(['maintenance', 'server_time'])
    expect(result.maintenance).toEqual({
      title: '系统维护',
      content: '服务升级',
      starts_at: expect.any(String),
      ends_at: expect.any(String),
    })
    for (const statement of [
      'select * from public.site_announcement',
      'select * from public.user_accounts',
      'select public.get_site_maintenance_status()',
      "select public.sync_user_records('[]')",
    ])
      await expect(db.query(statement)).rejects.toThrow(/permission denied/)
  })

  it.each(['draft', 'notice', 'expired', 'incomplete'])(
    '公开查询不返回 %s 维护信息',
    async kind => {
      await window()
      await db.exec(
        `reset role; update public.site_announcement set ${
          kind === 'draft'
            ? 'published = false'
            : kind === 'notice'
              ? "kind = 'notice', maintenance_start = null, maintenance_end = null"
              : kind === 'expired'
                ? "maintenance_start = now() - interval '2 hours', maintenance_end = now() - interval '1 hour'"
                : 'maintenance_start = null, maintenance_end = null'
        }`,
      )
      await db.exec('set role anon')
      const result = (
        await db.query<{ value: { maintenance: unknown } }>(
          'select public.get_public_site_maintenance_status() as value',
        )
      ).rows[0].value
      expect(result.maintenance).toBeNull()
    },
  )

  it('公开查询保留未来维护窗口，迁移重跑不改变公告版本和账号权限', async () => {
    await window("now() + interval '1 hour'", "now() + interval '2 hours'")
    await db.exec('reset role')
    await db.exec(publicStatusMigration)
  await db.exec(migration('202610290002_private_playback_lease'))
    await db.exec('set role anon')
    const result = (
      await db.query<{ value: { server_time: string; maintenance: { starts_at: string } } }>(
        'select public.get_public_site_maintenance_status() as value',
      )
    ).rows[0].value
    expect(Date.parse(result.maintenance.starts_at)).toBeGreaterThan(Date.parse(result.server_time))
    await db.exec('reset role')
    expect(
      (await db.query<{ revision: number }>('select revision from public.site_announcement'))
        .rows[0].revision,
    ).toBe(0)
    await asUser(user)
    expect(await active()).toBe(true)
  })
  it('维护可不填标题与正文，服务器保存固定标题，迁移重跑保留版本和内容', async () => {
    await asUser(admin)
    const result = (
      await db.query<{ value: { title: string; content: string; revision: number } }>(
        "select public.save_site_announcement('', '', true, 0, 'maintenance', null, clock_timestamp() - interval '1 hour', clock_timestamp() + interval '1 hour') as value",
      )
    ).rows[0].value
    expect(result).toMatchObject({ title: '系统维护', content: '', revision: 1 })
    await db.exec('reset role')
    await db.exec(optionalContentMigration)
    await asUser(user)
    expect(await active()).toBe(false)
    const snapshot = (
      await db.query<{ value: { maintenance: { title: string; content: string } } }>(
        'select public.get_site_maintenance_status() as value',
      )
    ).rows[0].value
    expect(snapshot.maintenance).toMatchObject({ title: '系统维护', content: '' })
    await asUser(admin)
    const saved = (
      await db.query<{ value: { revision: number } }>(
        'select public.get_site_announcement() as value',
      )
    ).rows[0].value
    expect(saved.revision).toBe(1)
  })

  it.each(['notice', 'version_update'])(
    '%s 接受空正文但仍拒绝空标题、超长内容及旧版本覆盖',
    async kind => {
      await asUser(admin)
      const sql =
        'select public.save_site_announcement($1, $2, true, $3, $4, null, null, null) as value'
      await expect(db.query(sql, ['', '', 0, kind])).rejects.toThrow('Invalid announcement')
      await expect(db.query(sql, ['标题', 'x'.repeat(10001), 0, kind])).rejects.toThrow(
        'Invalid announcement',
      )
      await expect(db.query(sql, ['x'.repeat(101), '', 0, kind])).rejects.toThrow(
        'Invalid announcement',
      )
      const result = (
        await db.query<{ value: { title: string; content: string } }>(sql, ['标题', '', 0, kind])
      ).rows[0].value
      expect(result).toMatchObject({ title: '标题', content: '' })
      await expect(db.query(sql, ['新标题', '', 0, kind])).rejects.toThrow('Announcement changed')
    },
  )

  it('旧版四参数 RPC 也接受空正文，普通用户不能发布', async () => {
    const sql = "select public.save_site_announcement('标题', '', true, 0) as value"
    await expect(db.query(sql)).rejects.toThrow('Admin required')
    await asUser(admin)
    const result = (await db.query<{ value: { kind: string; content: string } }>(sql)).rows[0].value
    expect(result).toMatchObject({ kind: 'notice', content: '' })
  })

  it('开始前与结束后正常访问，维护区间内服务器拒绝普通用户', async () => {
    await window("clock_timestamp() + interval '1 hour'", "clock_timestamp() + interval '2 hour'")
    await asUser(user)
    expect(await active()).toBe(true)
    await window()
    await asUser(user)
    expect(await active()).toBe(false)
    await window("clock_timestamp() - interval '2 hour'", "clock_timestamp() - interval '1 hour'")
    await asUser(user)
    expect(await active()).toBe(true)
  })

  it('维护不注销账号，仍能查询自己的身份和服务器维护状态', async () => {
    await window()
    await asUser(user)
    expect(
      (await db.query<{ id: string }>('select * from public.current_account()')).rows.map(
        row => row.id,
      ),
    ).toEqual([user])
    const result = (
      await db.query<{ value: { server_time: string; maintenance: { title: string } } }>(
        'select public.get_site_maintenance_status() as value',
      )
    ).rows[0].value
    expect(result.maintenance.title).toBe('维护中')
    await db.query("select public.touch_account_activity('Test browser')")
    expect(Number.isFinite(Date.parse(result.server_time))).toBe(true)
    expect((await db.query('select * from public.user_accounts')).rows).toHaveLength(0)
  })

  it('维护期间直接调用同步、播放授权、提醒RPC也不能绕过', async () => {
    await window()
    await asUser(user)
    expect((await db.query('select * from public.user_sync_records')).rows).toHaveLength(0)
    await expect(
      db.query(
        `select public.sync_user_records('[{"kind":"favorite","item_key":"x","value":{},"modified_at":1,"mutation_id":"x","deleted":false}]')`,
      ),
    ).rejects.toThrow(/row-level security/)
    await expect(
      db.query(
        "select public.playback_lease('acquire', '20000000-0000-4000-8000-000000000001', p_media_key => 'test')",
      ),
    ).rejects.toThrow('Inactive account')
    await expect(
      db.query("select public.sync_series_notifications('[]', array[]::text[])"),
    ).rejects.toThrow('Inactive account')
  })

  it('管理员始终能使用网站、管理公告，并能下架提前结束维护', async () => {
    await window()
    await asUser(admin)
    expect(await active()).toBe(true)
    expect((await db.query('select * from public.user_sync_records')).rows).toHaveLength(1)
    expect(
      (
        await db.query<{ value: { status: string } }>(
          "select public.playback_lease('acquire', '20000000-0000-4000-8000-000000000001', p_media_key => 'test') as value",
        )
      ).rows[0].value.status,
    ).toBe('held')
    await save(null, null, false)
    await asUser(user)
    expect(await active()).toBe(true)
    expect((await db.query('select * from public.user_sync_records')).rows).toHaveLength(1)
  })

  it('发布必须设置正长度窗口，草稿和旧的缺时间公告不封站', async () => {
    await asUser(admin)
    await expect(save(null, null)).rejects.toThrow('Invalid announcement')
    await expect(save('2027-01-01T01:00Z', null)).rejects.toThrow('Invalid announcement')
    await expect(save('2027-01-01T01:00Z', '2027-01-01T01:00Z')).rejects.toThrow(
      'Invalid announcement',
    )
    await save(null, null, false)
    await window('null', 'null')
    await asUser(user)
    expect(await active()).toBe(true)
  })

  it('管理员豁免不能绕过停用或会话失效，匿名用户也不能读取维护状态', async () => {
    await window()
    for (const update of [
      'enabled = false',
      "enabled = true, sessions_valid_after = clock_timestamp() + interval '1 hour'",
    ]) {
      await db.exec(`reset role; update public.user_accounts set ${update} where id = '${admin}'`)
      await asUser(admin)
      expect(await active()).toBe(false)
      expect((await db.query('select * from public.current_account()')).rows).toHaveLength(0)
      await expect(db.query('select public.get_site_maintenance_status()')).rejects.toThrow(
        'Inactive account',
      )
    }
    await db.exec('reset role; set role anon')
    await expect(db.query('select public.get_site_maintenance_status()')).rejects.toThrow(
      /permission denied/,
    )
  })

  it('迁移重跑不清除公告、维护窗口或账号数据', async () => {
    await window()
    await db.exec('reset role')
    await db.exec(maintenanceMigration)
    await asUser(admin)
    expect(await active()).toBe(true)
    expect((await db.query('select * from public.user_sync_records')).rows).toHaveLength(1)
    await asUser(user)
    expect(await active()).toBe(false)
  })
})
