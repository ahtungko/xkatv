// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const alice = '00000000-0000-4000-8000-000000000001'
const bob = '00000000-0000-4000-8000-000000000002'

const userSyncMigration = readFileSync(
  new URL('../supabase/migrations/202610010001_user_sync.sql', import.meta.url),
  'utf8',
)
const seriesNotificationsMigration = readFileSync(
  new URL('../supabase/migrations/202610190001_series_notifications.sql', import.meta.url),
  'utf8',
)
const pushMigration = readFileSync(
  new URL('../supabase/migrations/202611270001_series_push_notifications.sql', import.meta.url),
  'utf8',
)

let db: PGlite

async function asUser(id: string, active = true) {
  await db.exec('reset role; set role authenticated')
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, false), set_config('test.active', $2, false)",
    [id, String(active)],
  )
}

async function asServiceRole() {
  await db.exec('reset role; set role service_role')
}

async function insertNotificationRow(opts: {
  userId: string
  trackingKey: string
  bindingKey?: string
  sourceCode?: string
  vodId?: string
  knownEpisodes?: number[]
  readEpisodes?: number[]
  sourceCompleted?: boolean
  lastCheckedAt?: string | null
}) {
  const bindingKey = opts.bindingKey ?? 'auto'
  const sourceCode = opts.sourceCode ?? 'src1'
  const vodId = opts.vodId ?? '101'
  const resourceKey = JSON.stringify([opts.trackingKey, bindingKey, sourceCode, vodId, 'sig'])
  await db.exec('reset role')
  await db.query(
    `insert into public.series_notifications
      (user_id, resource_hash, resource_key, tracking_key, binding_key, source_code, vod_id,
       resource_signature, known_episodes, read_episodes, source_completed, last_checked_at)
     values
      ($1, encode(sha256(convert_to($2, 'UTF8')), 'hex'), $2, $3, $4, $5, $6, 'sig', $7, $8, $9, $10)`,
    [
      opts.userId,
      resourceKey,
      opts.trackingKey,
      bindingKey,
      sourceCode,
      vodId,
      opts.knownEpisodes ?? [1, 2],
      opts.readEpisodes ?? [1, 2],
      opts.sourceCompleted ?? false,
      opts.lastCheckedAt ?? null,
    ],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${alice}'), ('${bob}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create function public.account_is_active() returns boolean language sql stable as $$
      select coalesce(current_setting('test.active', true), 'false') = 'true';
    $$;
    create table public.user_accounts (
      id uuid primary key references auth.users(id) on delete cascade,
      username text not null,
      role text not null default 'user',
      enabled boolean not null default true
    );
    insert into public.user_accounts (id, username, enabled) values
      ('${alice}', 'alice', true),
      ('${bob}', 'bob', true);
    grant usage on schema auth to authenticated, service_role;
  `)
  await db.exec(userSyncMigration)
  await db.exec(seriesNotificationsMigration)
  await db.exec(pushMigration)
}, 45000)

beforeEach(async () => {
  await db.exec(`
    reset role;
    truncate public.user_notification_channels, public.series_notifications, public.user_sync_records;
    update public.user_accounts set enabled = true;
  `)
})

afterAll(async () => {
  await db?.close()
})

describe('外部推送通知 PostgreSQL 迁移与 RPC', () => {
  it('严格执行 RLS：用户只能读写自己的推送通道，匿名或停用账号被拒绝', async () => {
    await asUser(alice)
    await db.query(
      `insert into public.user_notification_channels (user_id, enabled, telegram_enabled, telegram_bot_token, telegram_chat_id)
       values ($1, true, true, '123:tok', '456')`,
      [alice],
    )

    await asUser(bob)
    expect((await db.query('select * from public.user_notification_channels')).rows).toHaveLength(0)
    await expect(
      db.query(
        `insert into public.user_notification_channels (user_id, enabled) values ($1, true)`,
        [alice],
      ),
    ).rejects.toThrow(/row-level security/)

    await asUser(alice, false)
    expect((await db.query('select * from public.user_notification_channels')).rows).toHaveLength(0)

    await db.exec('reset role; set role anon')
    await expect(db.query('select * from public.user_notification_channels')).rejects.toThrow(
      /permission denied/,
    )
  })

  it('仅 service_role 可调用后台巡检和批量更新 RPC', async () => {
    await asUser(alice)
    await expect(db.query('select public.get_due_series_notifications(2, 200)')).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      db.query("select public.batch_update_series_notifications('[]'::jsonb)"),
    ).rejects.toThrow(/permission denied/)
  })

  it('get_due_series_notifications 仅返回启用账号且仍在追更、匹配季与绑定的未完结剧集', async () => {
    await db.exec('reset role')
    // Alice enabled Telegram; Bob enabled Discord but his account will be disabled
    await db.query(
      `insert into public.user_notification_channels
        (user_id, enabled, telegram_enabled, telegram_bot_token, telegram_chat_id, discord_enabled, discord_mode, discord_webhook_url, discord_bot_token, discord_user_id)
       values
        ($1, true, true, '123:tok', '111', true, 'dm', '', 'bot-tok-alice', '123456789012345678'),
        ($2, true, false, '', '', true, 'webhook', 'https://discord.com/api/webhooks/1/a', '', '')`,
      [alice, bob],
    )
    await db.query('update public.user_accounts set enabled = false where id = $1', [bob])

    // Alice's favorites:
    // 1) Active TMDB S2 auto-bound (SHOULD match)
    // 2) Active TMDB S1 explicitly bound to src1/202 (SHOULD match bound row, NOT auto row)
    // 3) Untracked favorite (should NOT match)
    // 4) Deleted favorite (should NOT match)
    const favs = [
      {
        key: 'tmdb_tv_10',
        deleted: false,
        value: {
          id: 'tmdb_tv_10',
          sourceType: 'tmdb',
          media: { id: 10, mediaType: 'tv', title: '三体' },
          tracking: { enabled: true, seasonNumber: 2 },
        },
      },
      {
        key: 'tmdb_tv_20',
        deleted: false,
        value: {
          id: 'tmdb_tv_20',
          sourceType: 'tmdb',
          media: { id: 20, mediaType: 'tv', title: '庆余年' },
          tracking: {
            enabled: true,
            seasonNumber: 1,
            bindings: { '1': { sourceCode: 'src1', sourceName: '源1', vodId: '202', title: '庆余年' } },
          },
        },
      },
      {
        key: 'tmdb_tv_30',
        deleted: false,
        value: {
          id: 'tmdb_tv_30',
          sourceType: 'tmdb',
          media: { id: 30, mediaType: 'tv', title: '已停追' },
          tracking: { enabled: false, seasonNumber: 1 },
        },
      },
      {
        key: 'tmdb_tv_40',
        deleted: true,
        value: {
          id: 'tmdb_tv_40',
          sourceType: 'tmdb',
          media: { id: 40, mediaType: 'tv', title: '已删收藏' },
          tracking: { enabled: true, seasonNumber: 1 },
        },
      },
    ]
    for (const f of favs) {
      await db.query(
        `insert into public.user_sync_records (user_id, kind, item_key, value, modified_at, mutation_id, deleted)
         values ($1, 'favorite', $2, $3::jsonb, 1, 'm1', $4)`,
        [alice, f.key, JSON.stringify(f.value), f.deleted],
      )
    }

    // Matching S2 auto row
    await insertNotificationRow({ userId: alice, trackingKey: 'tmdb_tv_10::2', vodId: '101' })
    // Old S1 row (must be ignored)
    await insertNotificationRow({ userId: alice, trackingKey: 'tmdb_tv_10::1', vodId: '100' })
    // Matching bound row for tmdb_tv_20::1
    await insertNotificationRow({
      userId: alice,
      trackingKey: 'tmdb_tv_20::1',
      bindingKey: JSON.stringify(['src1', '202']),
      vodId: '202',
    })
    // Stale auto row for tmdb_tv_20::1 (must be ignored since favorite is bound)
    await insertNotificationRow({
      userId: alice,
      trackingKey: 'tmdb_tv_20::1',
      bindingKey: 'auto',
      vodId: '201',
    })
    // Untracked, deleted, completed, and recently-checked rows (all must be ignored)
    await insertNotificationRow({ userId: alice, trackingKey: 'tmdb_tv_30::1', vodId: '301' })
    await insertNotificationRow({ userId: alice, trackingKey: 'tmdb_tv_40::1', vodId: '401' })
    await insertNotificationRow({
      userId: alice,
      trackingKey: 'tmdb_tv_10::2',
      vodId: '109',
      sourceCompleted: true,
    })
    await insertNotificationRow({
      userId: alice,
      trackingKey: 'tmdb_tv_10::2',
      vodId: '108',
      lastCheckedAt: new Date().toISOString(),
    })

    await asServiceRole()
    const { rows } = await db.query<{
      data: {
        channels: Array<{
          user_id: string
          discord_mode: string
          discord_bot_token: string
          discord_user_id: string
        }>
        items: Array<{ vod_id: string; title: string; resource_hash: string; user_id: string }>
      }
    }>('select public.get_due_series_notifications(2, 200) as data')

    const { channels, items } = rows[0].data
    expect(channels.map(c => c.user_id)).toEqual([alice])
    expect(channels[0].discord_mode).toBe('dm')
    expect(channels[0].discord_bot_token).toBe('bot-tok-alice')
    expect(channels[0].discord_user_id).toBe('123456789012345678')
    expect(items.map(i => i.vod_id).sort()).toEqual(['101', '202'])
    expect(items.find(i => i.vod_id === '101')?.title).toBe('三体')

    // Batch update atomically unions known_episodes while keeping read_episodes intact
    const target = items.find(i => i.vod_id === '101')!
    const updateRes = await db.query<{ updated: number }>(
      'select public.batch_update_series_notifications($1::jsonb) as updated',
      [
        JSON.stringify([
          {
            userId: target.user_id,
            resourceHash: target.resource_hash,
            knownEpisodes: [2, 3, 4],
            lastCheckedAt: new Date().toISOString(),
            sourceCompleted: false,
            title: '三体（正片）',
          },
        ]),
      ],
    )
    expect(updateRes.rows[0].updated).toBe(1)

    await db.exec('reset role')
    const updatedRow = (
      await db.query<{
        known_episodes: number[]
        read_episodes: number[]
        title: string
        last_checked_at: string | null
      }>('select known_episodes, read_episodes, title, last_checked_at from public.series_notifications where resource_hash = $1', [
        target.resource_hash,
      ])
    ).rows[0]
    expect(updatedRow.known_episodes).toEqual([1, 2, 3, 4])
    expect(updatedRow.read_episodes).toEqual([1, 2])
    expect(updatedRow.title).toBe('三体（正片）')
    expect(updatedRow.last_checked_at).not.toBeNull()

    // Migration is idempotent
    await db.exec(pushMigration)
  })
})
