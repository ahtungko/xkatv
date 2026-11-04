// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const migrationPath = new URL('../supabase/migrations/202611040001_site_settings.sql', import.meta.url)
const adminId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
let db: PGlite

describe('全局站点配置数据库迁移与权限 (202611040001_site_settings.sql)', () => {
  beforeAll(async () => {
    expect(existsSync(migrationPath)).toBe(true)
    db = new PGlite()
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${adminId}'), ('${userId}');

      create table public.user_accounts (
        id uuid primary key references auth.users(id),
        role text not null check (role in ('admin', 'user'))
      );
      insert into public.user_accounts values
        ('${adminId}', 'admin'),
        ('${userId}', 'user');

      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;

      create function public.account_is_active() returns boolean language sql stable as $$
        select true;
      $$;

      grant usage on schema auth to authenticated;
    `)
    await db.exec(readFileSync(migrationPath, 'utf8'))
  }, 45000)

  beforeEach(async () => {
    await db.exec('reset role; set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [adminId])
  })

  afterAll(async () => {
    await db?.close()
  })

  it('初始迁移不覆盖环境配置，访客与普通用户读取未设置的开关均返回 null', async () => {
    // 匿名访客读取
    await db.exec('reset role; set role anon')
    const anonResult = await db.query<{ value: boolean | null }>(
      "select public.get_site_setting('is_live_enabled') as value"
    )
    expect(anonResult.rows[0].value).toBeNull()

    // 普通用户读取
    await db.exec('reset role; set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
    const userResult = await db.query<{ value: boolean | null }>(
      "select public.get_site_setting('is_live_enabled') as value"
    )
    expect(userResult.rows[0].value).toBeNull()
  })

  it('普通用户或未登录者尝试调用 set_site_setting 会被拒绝 (42501)', async () => {
    await db.exec('reset role; set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
    await expect(
      db.query("select public.set_site_setting('is_live_enabled', 'false'::jsonb)")
    ).rejects.toThrow(/Admin required/)

    await db.exec('reset role; set role anon')
    await expect(
      db.query("select public.set_site_setting('is_live_enabled', 'false'::jsonb)")
    ).rejects.toThrow()
  })

  it('管理员可以开启与关闭电视直播开关，并实时同步给读取函数', async () => {
    // 管理员修改为 false
    await db.exec('reset role; set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [adminId])
    await db.query("select public.set_site_setting('is_live_enabled', 'false'::jsonb)")

    // 普通用户读取显示为 false
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
    const checkFalse = await db.query<{ value: boolean }>(
      "select public.get_site_setting('is_live_enabled') as value"
    )
    expect(checkFalse.rows[0].value).toBe(false)

    // 管理员重新开启为 true
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [adminId])
    await db.query("select public.set_site_setting('is_live_enabled', 'true'::jsonb)")

    // 访客读取显示为 true
    await db.exec('reset role; set role anon')
    const checkTrue = await db.query<{ value: boolean }>(
      "select public.get_site_setting('is_live_enabled') as value"
    )
    expect(checkTrue.rows[0].value).toBe(true)
  })
})
