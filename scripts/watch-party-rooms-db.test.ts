// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const migrationPath = new URL('../supabase/migrations/202610290001_watch_party_rooms.sql', import.meta.url)
const alice = '00000000-0000-4000-8000-000000000001'
const bob = '00000000-0000-4000-8000-000000000002'
let db: PGlite

describe('放映室服务端生命周期', () => {
  beforeAll(async () => {
    expect(existsSync(migrationPath)).toBe(true)
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${alice}'), ('${bob}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create function public.account_is_active() returns boolean language sql stable as $$ select true $$;
      grant usage on schema auth to authenticated;
    `)
    await db.exec(readFileSync(migrationPath, 'utf8'))
  }, 45000)
  beforeEach(async () => {
    await db.exec('reset role; truncate public.watch_party_rooms; set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice])
  })
  afterAll(async () => { await db?.close() })

  it('房主关闭后访客立即查到已结束，其他账号不能关闭房间或重新创建同一编号', async () => {
    await db.query("select public.create_watch_party_room('room123', 'guest_cinema')")
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [bob])
    await expect(db.query("select public.close_watch_party_room('room123')")).rejects.toThrow()
    await expect(db.query("select public.create_watch_party_room('room123', 'guest_cinema')")).rejects.toThrow()
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice])
    await db.query("select public.close_watch_party_room('room123')")
    await db.exec('reset role; set role anon')
    const result = await db.query<{ status: string }>("select public.watch_party_room_status('room123') as status")
    expect(result.rows[0].status).toBe('closed')
  })

  it('刷新期间房间保持开放，未知房间不能作为有效链接', async () => {
    await db.query("select public.create_watch_party_room('room123', 'host_only')")
    await db.exec('reset role; set role anon')
    const opened = await db.query<{ status: string }>("select public.watch_party_room_status('room123') as status")
    const missing = await db.query<{ status: string }>("select public.watch_party_room_status('missing') as status")
    expect(opened.rows[0].status).toBe('open')
    expect(missing.rows[0].status).toBe('missing')
  })
})
