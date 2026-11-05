// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
it('isolates pairing sessions, requires TV consent, consumes pins and limits guesses', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 insert into auth.users values ('00000000-0000-4000-8000-000000000001');
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function public.account_is_active() returns boolean language sql as $$ select auth.uid() is not null $$;`)
    await db.exec(readFileSync('supabase/migrations/202611050001_tv_cast.sql', 'utf8'))
    const rpc = async (action: string, data: object = {}) =>
      (
        await db.query<{ value: Record<string, string> }>(
          'select public.tv_cast($1,$2::jsonb) as value',
          [action, JSON.stringify(data)],
        )
      ).rows[0].value
    await db.exec('set role anon')
    const tv = await rpc('create')
    await expect(rpc('pair', { pin: tv.pin })).rejects.toThrow('Login required')
    await db.exec(
      "reset role; set role authenticated; set test.uid='00000000-0000-4000-8000-000000000001'",
    )
    const phone = await rpc('pair', { pin: tv.pin })
    expect((await rpc('pair', { pin: tv.pin })).error).toBeTruthy()
    await expect(rpc('send', { ...phone, payload: { type: 'load_media' } })).rejects.toThrow(
      'TV confirmation required',
    )
    await expect(
      rpc('poll', { ...tv, token: '00000000-0000-4000-8000-000000000099' }),
    ).rejects.toThrow('Unauthorized')
    await rpc('send', { ...tv, payload: { type: 'connect_ack' } })
    await rpc('send', {
      ...phone,
      payload: { type: 'load_media', payload: { videoUrl: 'https://example.com/a.m3u8' } },
    })
    expect(JSON.stringify(await rpc('poll', tv))).toContain('load_media')
    for (let i = 0; i < 5; i++) await rpc('pair', { pin: 'missing' })
    expect((await rpc('pair', { pin: 'missing' })).error).toContain('尝试过多')
    await rpc('close', tv)
    await expect(rpc('poll', phone)).rejects.toThrow('Session expired')
  } finally {
    await db.close()
  }
}, 30000)
