-- =====================================================================
-- xkaTV v1.0.0 Consolidated Database Schema
--
-- This file consolidates all database migrations for xkaTV into a single
-- executable script for initializing a brand new Supabase project.
--
-- Features included:
-- 1. Multi-device User Sync (user_sync_records)
-- 2. Managed Accounts & Password Provisioning (managed_accounts)
-- 3. Admin Dashboard & Audit Logs
-- 4. NSFW Video Sources Access Control
-- 5. Single Active Playback Lease (playback_leases & private lease)
-- 6. Cross-Device Series Tracking & Episode Reminders (series_notifications)
-- 7. Site Announcements & Scheduled Maintenance Windows (site_announcements)
-- 8. Synchronized Watch Party Rooms (watch_party_rooms)
--
-- Usage:
-- Paste this entire file into your Supabase Dashboard -> SQL Editor and click "Run".
-- =====================================================================


-- ---------------------------------------------------------------------
-- [Migration] 202610010001_user_sync.sql
-- ---------------------------------------------------------------------

-- Run once in the Supabase SQL editor. Only authenticated users can access their own rows.
create table if not exists public.user_sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('favorite', 'history', 'preference')),
  item_key text not null check (length(item_key) between 1 and 2048),
  value jsonb,
  modified_at bigint not null check (modified_at >= 0),
  mutation_id text collate "C" not null,
  deleted boolean not null default false,
  primary key (user_id, kind, item_key)
);

alter table public.user_sync_records enable row level security;
create policy "Own sync rows" on public.user_sync_records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.user_sync_records from public, anon, authenticated;
grant select, insert, update on public.user_sync_records to authenticated;

-- Atomic conflict resolution prevents a stale device overwriting newer records.
-- Retain tombstones so offline devices learn about deletions.
create or replace function public.sync_user_records(changes jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 100 then
    raise exception 'Expected at most 100 changes';
  end if;
  insert into public.user_sync_records as existing
    (user_id, kind, item_key, value, modified_at, mutation_id, deleted)
  select auth.uid(), r.kind, r.item_key, r.value, r.modified_at, r.mutation_id, r.deleted
  from jsonb_to_recordset(changes) as r(
    kind text, item_key text, value jsonb, modified_at bigint, mutation_id text, deleted boolean
  )
  on conflict (user_id, kind, item_key) do update set
    value = excluded.value, modified_at = excluded.modified_at,
    mutation_id = excluded.mutation_id, deleted = excluded.deleted
  where (excluded.modified_at, excluded.mutation_id collate "C") >
        (existing.modified_at, existing.mutation_id collate "C");
end;
$$;
revoke all on function public.sync_user_records(jsonb) from public, anon;
grant execute on function public.sync_user_records(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- [Migration] 202610010002_managed_accounts.sql
-- ---------------------------------------------------------------------

-- Apply after 202610010001_user_sync.sql, using the Supabase SQL editor.
create table public.user_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  role text not null default 'user' check (role in ('admin', 'user')),
  enabled boolean not null default true,
  sessions_valid_after timestamptz not null default '-infinity',
  created_at timestamptz not null default now()
);
alter table public.user_accounts enable row level security;
revoke all on public.user_accounts from public, anon, authenticated;
grant select on public.user_accounts to authenticated;
grant all on public.user_accounts to service_role;

-- Signup metadata supplied by clients cannot provision accounts or grant roles.
create function public.provision_managed_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.raw_app_meta_data ->> 'managed_account') is distinct from 'true' then
    raise exception 'Accounts must be created by an administrator';
  end if;
  insert into public.user_accounts(id, username, role)
  values (new.id, new.raw_app_meta_data ->> 'username',
          coalesce(new.raw_app_meta_data ->> 'account_role', 'user'));
  return new;
end;
$$;
revoke all on function public.provision_managed_account() from public, anon, authenticated;
create trigger provision_managed_account after insert on auth.users
for each row execute function public.provision_managed_account();

-- Checking the session's creation time (not token iat) prevents refresh of a
-- pre-reset session from restoring access. Disabled users are blocked immediately.
create function public.account_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_accounts a join auth.sessions s on s.user_id = a.id
    where a.id = (select auth.uid()) and a.enabled
      and s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.created_at > a.sessions_valid_after
  );
$$;
revoke all on function public.account_is_active() from public, anon;
grant execute on function public.account_is_active() to authenticated;
create policy "Read own active account" on public.user_accounts
for select to authenticated using (id = (select auth.uid()) and (select public.account_is_active()));

create function public.current_account()
returns table (id uuid, username text, role text, enabled boolean, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.username, a.role, a.enabled, a.created_at
  from public.user_accounts a where a.id = (select auth.uid());
$$;
revoke all on function public.current_account() from public, anon;
grant execute on function public.current_account() to authenticated;

drop policy "Own sync rows" on public.user_sync_records;
create policy "Own active account sync rows" on public.user_sync_records
for all to authenticated
using (user_id = (select auth.uid()) and (select public.account_is_active()))
with check (user_id = (select auth.uid()) and (select public.account_is_active()));

-- The API calls this before disabling/resetting users; the database clock is authoritative.
create function public.invalidate_account_sessions(target_id uuid, new_enabled boolean default null)
returns void language sql security invoker set search_path = '' as $$
  update public.user_accounts set sessions_valid_after = clock_timestamp(),
    enabled = coalesce(new_enabled, enabled) where id = target_id and role = 'user';
$$;
revoke all on function public.invalidate_account_sessions(uuid, boolean) from public, anon, authenticated;
grant execute on function public.invalidate_account_sessions(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------
-- [Migration] 202610010003_account_provisioning_fix.sql
-- ---------------------------------------------------------------------

drop trigger if exists provision_managed_account on auth.users;
drop function if exists public.provision_managed_account();

-- ---------------------------------------------------------------------
-- [Migration] 202610020001_admin_dashboard.sql
-- ---------------------------------------------------------------------

create table if not exists public.account_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  label text not null check (length(label) between 1 and 160),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, session_id)
);
alter table public.account_devices enable row level security;
revoke all on public.account_devices from public, anon, authenticated;
grant all on public.account_devices to service_role;

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_username text not null,
  target_id uuid,
  target_username text,
  action text not null check (action in (
    'create', 'set_enabled', 'reset_password', 'force_logout', 'delete'
  )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from public, anon, authenticated;
grant select, insert on public.admin_audit_log to service_role;
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc, id desc);

create or replace function public.touch_account_activity(device_label text)
returns void language plpgsql security definer set search_path = '' as $$
declare session_uuid uuid;
begin
  if not public.account_is_active() then raise exception 'Inactive account'; end if;
  session_uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  if session_uuid is null then raise exception 'Session required'; end if;
  insert into public.account_devices(user_id, session_id, label)
  values (auth.uid(), session_uuid, left(coalesce(nullif(device_label, ''), 'Unknown device'), 160))
  on conflict (user_id, session_id) do update set
    label = excluded.label, last_seen_at = clock_timestamp();
end;
$$;
revoke all on function public.touch_account_activity(text) from public, anon;
grant execute on function public.touch_account_activity(text) to authenticated;

-- Session invalidation also removes the dashboard's now-stale device rows.
create or replace function public.invalidate_account_sessions(target_id uuid, new_enabled boolean default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.user_accounts set sessions_valid_after = clock_timestamp(),
    enabled = coalesce(new_enabled, enabled) where id = target_id and role = 'user';
  delete from public.account_devices where user_id = target_id;
end;
$$;

-- ---------------------------------------------------------------------
-- [Migration] 202610020002_nsfw_access.sql
-- ---------------------------------------------------------------------

alter table public.user_accounts
  add column if not exists allow_nsfw boolean not null default false;

drop function if exists public.current_account();
create function public.current_account()
returns table (
  id uuid,
  username text,
  role text,
  enabled boolean,
  allow_nsfw boolean,
  created_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.username, a.role, a.enabled, a.allow_nsfw, a.created_at
  from public.user_accounts a where a.id = (select auth.uid());
$$;
revoke all on function public.current_account() from public, anon;
grant execute on function public.current_account() to authenticated;

create or replace function public.set_account_nsfw(target_id uuid, new_allow_nsfw boolean)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.user_accounts
  set allow_nsfw = new_allow_nsfw, sessions_valid_after = clock_timestamp()
  where id = target_id and role = 'user';
  delete from public.account_devices where user_id = target_id;
end;
$$;
revoke all on function public.set_account_nsfw(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_account_nsfw(uuid, boolean) to service_role;

alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_action_check;
alter table public.admin_audit_log
  add constraint admin_audit_log_action_check check (action in (
    'create', 'set_enabled', 'set_nsfw', 'reset_password', 'force_logout', 'delete'
  ));

-- ---------------------------------------------------------------------
-- [Migration] 202610030001_playback_lease.sql
-- ---------------------------------------------------------------------

-- Apply after the managed-account migrations. One renewable playback lease per account.
begin;

create table if not exists public.account_playback (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  player_id uuid not null,
  lease_id uuid not null,
  device_label text not null,
  media_key text not null,
  title text not null,
  position double precision not null default 0,
  duration double precision not null default 0,
  expires_at timestamptz not null
);
alter table public.account_playback enable row level security;
revoke all on public.account_playback from public, anon, authenticated;
grant all on public.account_playback to service_role;

-- Recreate only the RPC so reruns also support previously named parameters.
drop function if exists public.playback_lease(text, uuid, uuid, uuid, text, text, text, double precision, double precision);
create function public.playback_lease(
  p_operation text,
  p_player uuid,
  p_lease uuid default null,
  p_takeover uuid default null,
  p_device_label text default '',
  p_media_key text default '',
  p_title text default '',
  p_position double precision default null,
  p_duration double precision default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  previous public.account_playback%rowtype;
  lease_clock timestamptz;
  next_lease uuid;
  resume_position double precision := null;
begin
  if not public.account_is_active() or sid is null then raise exception 'Inactive account'; end if;
  if p_player is null or p_operation is null or p_operation not in ('acquire', 'renew', 'release') then
    raise exception 'Invalid playback operation';
  end if;
  if p_position is not null and not (p_position >= 0 and p_position < 1000000000) then
    raise exception 'Invalid position';
  end if;
  if p_duration is not null and not (p_duration >= 0 and p_duration < 1000000000) then
    raise exception 'Invalid duration';
  end if;
  -- Serialize even first-time claims; the lease row might not exist yet.
  perform 1 from public.user_accounts a where a.id = uid for update;
  lease_clock := clock_timestamp();
  select * into previous from public.account_playback p where p.user_id = uid for update;

  if p_operation = 'acquire' then
    if length(p_media_key) not between 1 and 2048 then raise exception 'Invalid media key'; end if;
    if previous.user_id is not null and previous.expires_at > lease_clock
       and not (previous.player_id = p_player and previous.session_id = sid)
       and p_takeover is distinct from previous.lease_id then
      return jsonb_build_object('status', 'busy', 'lease_id', previous.lease_id,
        'device_label', previous.device_label, 'title', previous.title);
    end if;
    if previous.media_key = p_media_key and previous.player_id <> p_player then
      resume_position := previous.position;
    end if;
    next_lease := case when previous.player_id = p_player and previous.session_id = sid
      and previous.expires_at > lease_clock then previous.lease_id else gen_random_uuid() end;
    insert into public.account_playback as p
      (user_id, session_id, player_id, lease_id, device_label, media_key, title, position, duration, expires_at)
    values (uid, sid, p_player, next_lease, left(p_device_label, 160), p_media_key, left(p_title, 300),
      coalesce(resume_position, p_position, 0), coalesce(p_duration, 0), lease_clock + interval '30 seconds')
    on conflict (user_id) do update set session_id = excluded.session_id,
      player_id = excluded.player_id, lease_id = excluded.lease_id,
      device_label = excluded.device_label, media_key = excluded.media_key, title = excluded.title,
      position = excluded.position, duration = excluded.duration, expires_at = excluded.expires_at;
    return jsonb_build_object('status', 'held', 'lease_id', next_lease,
      'resume_position', resume_position, 'ttl_ms', 30000);
  end if;

  if previous.player_id is distinct from p_player or previous.session_id is distinct from sid
     or previous.lease_id is distinct from p_lease or previous.expires_at <= lease_clock then
    return jsonb_build_object('status', 'lost');
  end if;
  update public.account_playback p set
    position = coalesce(p_position, p.position),
    duration = coalesce(p_duration, p.duration),
    expires_at = case when p_operation = 'release' then lease_clock else lease_clock + interval '30 seconds' end
  where p.user_id = uid;
  return jsonb_build_object('status', case when p_operation = 'release' then 'released' else 'held' end,
    'lease_id', previous.lease_id, 'ttl_ms', 30000);
end;
$$;
revoke all on function public.playback_lease(text, uuid, uuid, uuid, text, text, text, double precision, double precision) from public, anon;
grant execute on function public.playback_lease(text, uuid, uuid, uuid, text, text, text, double precision, double precision) to authenticated;

-- Fence delayed progress from a replaced player, including updates queued while offline.
-- The row lock prevents a takeover racing a progress write in the same transaction.
create or replace function public.guard_playback_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare current_lease public.account_playback%rowtype;
begin
  if new.kind <> 'history' or new.deleted or not (new.value ? 'playbackLeaseId') then return new; end if;
  select * into current_lease from public.account_playback p where p.user_id = new.user_id for share;
  if current_lease.lease_id::text is distinct from new.value ->> 'playbackLeaseId'
     or current_lease.session_id::text is distinct from auth.jwt() ->> 'session_id'
     or current_lease.media_key is distinct from new.item_key then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_playback_progress() from public, anon, authenticated;
drop trigger if exists guard_playback_progress on public.user_sync_records;
create trigger guard_playback_progress before insert or update on public.user_sync_records
for each row execute function public.guard_playback_progress();

-- A new authorized player wins over the previous player's clock, even if it was ahead.
create or replace function public.sync_user_records(changes jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 100 then
    raise exception 'Expected at most 100 changes';
  end if;
  insert into public.user_sync_records as existing
    (user_id, kind, item_key, value, modified_at, mutation_id, deleted)
  select auth.uid(), r.kind, r.item_key, r.value, r.modified_at, r.mutation_id, r.deleted
  from jsonb_to_recordset(changes) as r(
    kind text, item_key text, value jsonb, modified_at bigint, mutation_id text, deleted boolean
  )
  on conflict (user_id, kind, item_key) do update set
    value = excluded.value, modified_at = excluded.modified_at,
    mutation_id = excluded.mutation_id, deleted = excluded.deleted
  where (excluded.modified_at, excluded.mutation_id collate "C") >
        (existing.modified_at, existing.mutation_id collate "C")
     or (excluded.kind = 'history' and not excluded.deleted
         and excluded.value ? 'playbackLeaseId'
         and (excluded.value ->> 'playbackLeaseId') is distinct from (existing.value ->> 'playbackLeaseId'));
end;
$$;

commit;

-- ---------------------------------------------------------------------
-- [Migration] 202610190001_series_notifications.sql
-- ---------------------------------------------------------------------

-- Cross-device episode receipts. Does not store source URLs, tokens or playlists.
create table if not exists public.series_notifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_hash text not null check (length(resource_hash) = 64),
  resource_key text not null check (length(resource_key) between 1 and 8192),
  tracking_key text not null check (length(tracking_key) between 1 and 2048),
  binding_key text not null check (length(binding_key) between 1 and 2048),
  source_code text not null check (length(source_code) between 1 and 512),
  vod_id text not null check (vod_id ~ '^[\w-]+$' and length(vod_id) <= 512),
  resource_signature text not null check (length(resource_signature) <= 128),
  known_episodes integer[] not null,
  read_episodes integer[] not null,
  check (cardinality(known_episodes) between 1 and 9999),
  check (read_episodes <@ known_episodes),
  primary key (user_id, resource_hash)
);
alter table public.series_notifications enable row level security;
drop policy if exists "Own active account episode receipts" on public.series_notifications;
create policy "Own active account episode receipts" on public.series_notifications
for select to authenticated using (user_id = (select auth.uid()) and (select public.account_is_active()));
revoke all on public.series_notifications from public, anon, authenticated;
grant select on public.series_notifications to authenticated;

create or replace function public.series_episode_union(a integer[], b integer[])
returns integer[] language sql immutable set search_path = '' as $$
  select array(select distinct n from unnest(a || b) as n order by n);
$$;
revoke all on function public.series_episode_union(integer[], integer[]) from public, anon, authenticated;

create or replace function public.series_parse_episodes(value jsonb)
returns integer[] language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(value) is distinct from 'array' then raise exception 'Expected episode array'; end if;
  if jsonb_array_length(value) > 9999 then raise exception 'Too many episodes'; end if;
  if exists (select 1 from jsonb_array_elements(value) as e
    where jsonb_typeof(e) <> 'number' or e::text !~ '^[1-9][0-9]{0,3}$') then
    raise exception 'Invalid episode number';
  end if;
  return array(select distinct e::text::integer from jsonb_array_elements(value) as e order by 1);
end;
$$;
revoke all on function public.series_parse_episodes(jsonb) from public, anon, authenticated;

create or replace function public.sync_series_notifications(p_changes jsonb, p_resource_keys text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_known integer[];
  v_read integer[];
  v_baseline integer[];
  answer jsonb;
begin
  if auth.uid() is null or not public.account_is_active() then raise exception 'Inactive account'; end if;
  if jsonb_typeof(p_changes) is distinct from 'array' then raise exception 'Expected changes array'; end if;
  if jsonb_array_length(p_changes) > 25 or p_resource_keys is null or cardinality(p_resource_keys) > 25 then
    raise exception 'Expected at most 25 resources';
  end if;
  for r in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(r) <> 'object' or exists (
      select 1 from unnest(array['resourceKey','trackingKey','bindingKey','sourceCode','vodId','resourceSignature']) as field
      where jsonb_typeof(r -> field) is distinct from 'string'
    ) then raise exception 'Invalid resource identity'; end if;
    if (r ->> 'resourceKey')::jsonb <> jsonb_build_array(r ->> 'trackingKey', r ->> 'bindingKey',
      r ->> 'sourceCode', r ->> 'vodId', r ->> 'resourceSignature') or
      not ((r ->> 'resourceKey') = any(p_resource_keys)) then raise exception 'Resource identity mismatch'; end if;
    v_known := public.series_parse_episodes(r -> 'knownEpisodes');
    v_read := public.series_parse_episodes(r -> 'readEpisodes');
    v_baseline := public.series_parse_episodes(r -> 'baselineEpisodes');
    if cardinality(v_known) = 0 or not (v_read <@ v_known) or not (v_baseline <@ v_known) then
      raise exception 'Receipts must refer to observed episodes';
    end if;
    insert into public.series_notifications as existing (user_id, resource_hash, resource_key, tracking_key,
      binding_key, source_code, vod_id, resource_signature, known_episodes, read_episodes)
    values (auth.uid(), encode(sha256(convert_to(r ->> 'resourceKey', 'UTF8')), 'hex'), r ->> 'resourceKey', r ->> 'trackingKey', r ->> 'bindingKey',
      r ->> 'sourceCode', r ->> 'vodId', r ->> 'resourceSignature', v_known,
      public.series_episode_union(v_baseline, v_read))
    on conflict (user_id, resource_hash) do update set
      known_episodes = public.series_episode_union(existing.known_episodes, excluded.known_episodes),
      -- Only explicit receipts apply to an existing baseline. A fresh device's
      -- implicit "everything already existed" baseline must not clear cloud unread.
      read_episodes = public.series_episode_union(existing.read_episodes, v_read);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'resourceKey', n.resource_key, 'trackingKey', n.tracking_key, 'bindingKey', n.binding_key,
    'sourceCode', n.source_code, 'vodId', n.vod_id, 'resourceSignature', n.resource_signature,
    'knownEpisodes', n.known_episodes, 'readEpisodes', n.read_episodes) order by n.resource_key), '[]'::jsonb)
  into answer from public.series_notifications n
  where n.user_id = auth.uid() and n.resource_key = any(p_resource_keys);
  return answer;
end;
$$;
revoke all on function public.sync_series_notifications(jsonb, text[]) from public, anon;
grant execute on function public.sync_series_notifications(jsonb, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- [Migration] 202610200001_site_announcement.sql
-- ---------------------------------------------------------------------

-- One current site announcement. Apply after the managed-account migrations.
create table if not exists public.site_announcement (
  id boolean primary key default true check (id),
  title text not null default '' check (length(title) <= 100),
  content text not null default '' check (length(content) <= 10000),
  published boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  check (not published or (length(btrim(title)) > 0 and length(btrim(content)) > 0))
);
insert into public.site_announcement(id) values (true) on conflict do nothing;
alter table public.site_announcement enable row level security;
revoke all on public.site_announcement from public, anon, authenticated;
grant select on public.site_announcement to authenticated;
grant all on public.site_announcement to service_role;

drop policy if exists "Read site announcement" on public.site_announcement;
create policy "Read site announcement" on public.site_announcement
for select to authenticated using (
  (select public.account_is_active()) and (
    published or exists (
      select 1 from public.user_accounts a
      where a.id = (select auth.uid()) and a.role = 'admin'
    )
  )
);

create or replace function public.get_site_announcement()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.account_is_active() then raise exception 'Inactive account'; end if;
  return (select to_jsonb(a) - 'id' from public.site_announcement a where a.id);
end;
$$;
revoke all on function public.get_site_announcement() from public, anon;
grant execute on function public.get_site_announcement() to authenticated;

create or replace function public.save_site_announcement(
  p_title text, p_content text, p_published boolean, p_expected_revision integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision integer; result jsonb;
begin
  if not public.account_is_active() or not exists (
    select 1 from public.user_accounts where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  if p_title is null or p_content is null or p_published is null
    or length(p_title) > 100 or length(p_content) > 10000
    or (p_published and (length(btrim(p_title)) = 0 or length(btrim(p_content)) = 0)) then
    raise exception 'Invalid announcement';
  end if;
  select revision into current_revision from public.site_announcement where id for update;
  if p_expected_revision is null or p_expected_revision is distinct from current_revision then
    raise exception 'Announcement changed';
  end if;
  update public.site_announcement set
    title = btrim(p_title), content = btrim(p_content), published = p_published,
    revision = revision + 1, updated_at = clock_timestamp()
  where id returning to_jsonb(site_announcement) - 'id' into result;
  return result;
end;
$$;
revoke all on function public.save_site_announcement(text, text, boolean, integer)
  from public, anon;
grant execute on function public.save_site_announcement(text, text, boolean, integer)
  to authenticated;

-- ---------------------------------------------------------------------
-- [Migration] 202610200002_announcement_types.sql
-- ---------------------------------------------------------------------

-- Apply after 202610200001_site_announcement.sql. Existing notices remain intact.
alter table public.site_announcement
  add column if not exists kind text not null default 'notice',
  add column if not exists version_label text,
  add column if not exists maintenance_start timestamptz,
  add column if not exists maintenance_end timestamptz;

alter table public.site_announcement drop constraint if exists site_announcement_kind_check;
alter table public.site_announcement add constraint site_announcement_kind_check check (
  kind in ('notice', 'maintenance', 'version_update')
  and (version_label is null or (kind = 'version_update' and length(version_label) <= 40))
  and (kind = 'maintenance' or (maintenance_start is null and maintenance_end is null))
  and (maintenance_start is null or maintenance_end is null or maintenance_end >= maintenance_start)
  and (maintenance_start is null or isfinite(maintenance_start))
  and (maintenance_end is null or isfinite(maintenance_end))
);

-- No default arguments: the original four-argument RPC remains unambiguous for old clients.
create or replace function public.save_site_announcement(
  p_title text, p_content text, p_published boolean, p_expected_revision integer,
  p_kind text, p_version_label text, p_maintenance_start timestamptz, p_maintenance_end timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision integer; result jsonb;
begin
  if not public.account_is_active() or not exists (
    select 1 from public.user_accounts where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  if p_title is null or p_content is null or p_published is null
    or length(p_title) > 100 or length(p_content) > 10000
    or (p_published and (length(btrim(p_title)) = 0 or length(btrim(p_content)) = 0))
    or p_kind is null or p_kind not in ('notice', 'maintenance', 'version_update')
    or length(p_version_label) > 40
    or (p_maintenance_start is not null and not isfinite(p_maintenance_start))
    or (p_maintenance_end is not null and not isfinite(p_maintenance_end))
    or (p_kind = 'maintenance' and p_maintenance_start is not null and p_maintenance_end is not null
        and p_maintenance_end < p_maintenance_start) then
    raise exception 'Invalid announcement';
  end if;
  select revision into current_revision from public.site_announcement where id for update;
  if p_expected_revision is null or p_expected_revision is distinct from current_revision then
    raise exception 'Announcement changed';
  end if;
  update public.site_announcement set
    title = btrim(p_title), content = btrim(p_content), published = p_published,
    kind = p_kind,
    version_label = case when p_kind = 'version_update' then nullif(btrim(p_version_label), '') end,
    maintenance_start = case when p_kind = 'maintenance' then p_maintenance_start end,
    maintenance_end = case when p_kind = 'maintenance' then p_maintenance_end end,
    revision = revision + 1, updated_at = clock_timestamp()
  where id returning to_jsonb(site_announcement) - 'id' into result;
  return result;
end;
$$;
revoke all on function public.save_site_announcement(text, text, boolean, integer, text, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.save_site_announcement(text, text, boolean, integer, text, text, timestamptz, timestamptz)
  to authenticated;

-- Old editors can still publish a plain notice without retaining stale type-specific metadata.
create or replace function public.save_site_announcement(
  p_title text, p_content text, p_published boolean, p_expected_revision integer
)
returns jsonb language sql security invoker set search_path = '' as $$
  select public.save_site_announcement(
    p_title, p_content, p_published, p_expected_revision, 'notice', null, null, null
  );
$$;
revoke all on function public.save_site_announcement(text, text, boolean, integer) from public, anon;
grant execute on function public.save_site_announcement(text, text, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------
-- [Migration] 202610200003_scheduled_maintenance.sql
-- ---------------------------------------------------------------------

-- Apply after announcement types and all existing managed-account migrations.
begin;

-- Keep identity validation separate so maintenance never signs users out or locks out admins.
create or replace function public.account_session_is_valid()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_accounts a join auth.sessions s on s.user_id = a.id
    where a.id = (select auth.uid()) and a.enabled
      and s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.created_at > a.sessions_valid_after
  );
$$;
revoke all on function public.account_session_is_valid() from public, anon;
grant execute on function public.account_session_is_valid() to authenticated;

create or replace function public.account_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.account_session_is_valid() and (
    exists (select 1 from public.user_accounts where id = auth.uid() and role = 'admin')
    or not exists (
      select 1 from public.site_announcement where id and published and kind = 'maintenance'
        and maintenance_start is not null and maintenance_end is not null
        and maintenance_start <= statement_timestamp() and statement_timestamp() < maintenance_end
    )
  );
$$;
revoke all on function public.account_is_active() from public, anon;
grant execute on function public.account_is_active() to authenticated;

-- Only return the caller's identity, even while their access to site data is suspended.
create or replace function public.current_account()
returns table (id uuid, username text, role text, enabled boolean, allow_nsfw boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.username, a.role, a.enabled, a.allow_nsfw, a.created_at
  from public.user_accounts a
  where a.id = auth.uid() and public.account_session_is_valid();
$$;
revoke all on function public.current_account() from public, anon;
grant execute on function public.current_account() to authenticated;

create or replace function public.touch_account_activity(device_label text)
returns void language plpgsql security definer set search_path = '' as $$
declare session_uuid uuid;
begin
  if not public.account_session_is_valid() then raise exception 'Inactive account'; end if;
  session_uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  if session_uuid is null then raise exception 'Session required'; end if;
  insert into public.account_devices(user_id, session_id, label)
  values (auth.uid(), session_uuid, left(coalesce(nullif(device_label, ''), 'Unknown device'), 160))
  on conflict (user_id, session_id) do update set label = excluded.label, last_seen_at = clock_timestamp();
end;
$$;
revoke all on function public.touch_account_activity(text) from public, anon;
grant execute on function public.touch_account_activity(text) to authenticated;

create or replace function public.get_site_maintenance_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare maintenance jsonb;
begin
  if not public.account_session_is_valid() then raise exception 'Inactive account'; end if;
  select jsonb_build_object('title', title, 'content', content,
    'starts_at', maintenance_start, 'ends_at', maintenance_end)
  into maintenance from public.site_announcement
  where id and published and kind = 'maintenance'
    and maintenance_start is not null and maintenance_end is not null;
  return jsonb_build_object('server_time', clock_timestamp(), 'maintenance', maintenance);
end;
$$;
revoke all on function public.get_site_maintenance_status() from public, anon;
grant execute on function public.get_site_maintenance_status() to authenticated;

-- Existing announcements without a full time window remain readable but do not close the site.
-- All newly published maintenance notices must define a positive window.
create or replace function public.save_site_announcement(
  p_title text, p_content text, p_published boolean, p_expected_revision integer,
  p_kind text, p_version_label text, p_maintenance_start timestamptz, p_maintenance_end timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision integer; result jsonb;
begin
  if not public.account_is_active() or not exists (
    select 1 from public.user_accounts where id = auth.uid() and role = 'admin'
  ) then raise exception 'Admin required' using errcode = '42501'; end if;
  if p_title is null or p_content is null or p_published is null
    or length(p_title) > 100 or length(p_content) > 10000
    or (p_published and (length(btrim(p_title)) = 0 or length(btrim(p_content)) = 0))
    or p_kind is null or p_kind not in ('notice', 'maintenance', 'version_update')
    or length(p_version_label) > 40
    or (p_maintenance_start is not null and not isfinite(p_maintenance_start))
    or (p_maintenance_end is not null and not isfinite(p_maintenance_end))
    or (p_kind = 'maintenance' and p_maintenance_start is not null and p_maintenance_end is not null
        and p_maintenance_end <= p_maintenance_start)
    or (p_published and p_kind = 'maintenance' and (p_maintenance_start is null or p_maintenance_end is null))
  then raise exception 'Invalid announcement'; end if;
  select revision into current_revision from public.site_announcement where id for update;
  if p_expected_revision is null or p_expected_revision is distinct from current_revision
  then raise exception 'Announcement changed'; end if;
  update public.site_announcement set
    title = btrim(p_title), content = btrim(p_content), published = p_published, kind = p_kind,
    version_label = case when p_kind = 'version_update' then nullif(btrim(p_version_label), '') end,
    maintenance_start = case when p_kind = 'maintenance' then p_maintenance_start end,
    maintenance_end = case when p_kind = 'maintenance' then p_maintenance_end end,
    revision = revision + 1, updated_at = clock_timestamp()
  where id returning to_jsonb(site_announcement) - 'id' into result;
  return result;
end;
$$;
revoke all on function public.save_site_announcement(text, text, boolean, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.save_site_announcement(text, text, boolean, integer, text, text, timestamptz, timestamptz) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- [Migration] 202610220001_optional_announcement_content.sql
-- ---------------------------------------------------------------------

-- Apply after 202610200003_scheduled_maintenance.sql. Preserves existing content and revisions.
begin;

alter table public.site_announcement drop constraint if exists site_announcement_check;
alter table public.site_announcement add constraint site_announcement_check
  check (not published or length(btrim(title)) > 0);

create or replace function public.save_site_announcement(
  p_title text, p_content text, p_published boolean, p_expected_revision integer,
  p_kind text, p_version_label text, p_maintenance_start timestamptz, p_maintenance_end timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision integer; result jsonb;
  normalized_title text := case when p_kind = 'maintenance' then '系统维护' else btrim(coalesce(p_title, '')) end;
  normalized_content text := btrim(coalesce(p_content, ''));
begin
  if not public.account_is_active() or not exists (
    select 1 from public.user_accounts where id = auth.uid() and role = 'admin'
  ) then raise exception 'Admin required' using errcode = '42501'; end if;
  if p_published is null
    or length(normalized_title) > 100 or length(normalized_content) > 10000
    or (p_published and length(normalized_title) = 0)
    or p_kind is null or p_kind not in ('notice', 'maintenance', 'version_update')
    or length(p_version_label) > 40
    or (p_maintenance_start is not null and not isfinite(p_maintenance_start))
    or (p_maintenance_end is not null and not isfinite(p_maintenance_end))
    or (p_kind = 'maintenance' and p_maintenance_start is not null and p_maintenance_end is not null
        and p_maintenance_end <= p_maintenance_start)
    or (p_published and p_kind = 'maintenance' and (p_maintenance_start is null or p_maintenance_end is null))
  then raise exception 'Invalid announcement'; end if;
  select revision into current_revision from public.site_announcement where id for update;
  if p_expected_revision is null or p_expected_revision is distinct from current_revision
  then raise exception 'Announcement changed'; end if;
  update public.site_announcement set
    title = normalized_title, content = normalized_content, published = p_published, kind = p_kind,
    version_label = case when p_kind = 'version_update' then nullif(btrim(p_version_label), '') end,
    maintenance_start = case when p_kind = 'maintenance' then p_maintenance_start end,
    maintenance_end = case when p_kind = 'maintenance' then p_maintenance_end end,
    revision = revision + 1, updated_at = clock_timestamp()
  where id returning to_jsonb(site_announcement) - 'id' into result;
  return result;
end;
$$;
revoke all on function public.save_site_announcement(text, text, boolean, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.save_site_announcement(text, text, boolean, integer, text, text, timestamptz, timestamptz) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- [Migration] 202610250001_public_maintenance_status.sql
-- ---------------------------------------------------------------------

-- Apply after the scheduled-maintenance and optional-announcement-body migrations.
begin;

-- This public projection exposes no drafts, account data or announcement metadata.
-- Include future windows so an already-open login page can enter maintenance on time.
create or replace function public.get_public_site_maintenance_status()
returns jsonb language sql volatile security definer set search_path = '' as $$
  select jsonb_build_object(
    'server_time', clock_timestamp(),
    'maintenance', (
      select jsonb_build_object(
        'title', '系统维护', 'content', content,
        'starts_at', maintenance_start, 'ends_at', maintenance_end
      )
      from public.site_announcement
      where id and published and kind = 'maintenance'
        and maintenance_start is not null and maintenance_end is not null
        and maintenance_start < maintenance_end
        and statement_timestamp() < maintenance_end
    )
  );
$$;
revoke all on function public.get_public_site_maintenance_status() from public, anon, authenticated;
grant execute on function public.get_public_site_maintenance_status() to anon, authenticated;

commit;

-- ---------------------------------------------------------------------
-- [Migration] 202610270001_cleanup_danmaku_preferences.sql
-- ---------------------------------------------------------------------

-- Migration: 202610270001_cleanup_danmaku_preferences.sql
-- 清理云端同步表 user_sync_records 中历史残留的弹幕偏好配置数据。
-- 弹幕功能已下线，相关配置不再参与跨设备同步。

delete from public.user_sync_records
where kind = 'preference'
  and (
    item_key in (
      'playback.isDanmakuEnabled',
      'playback.danmakuOpacity',
      'playback.danmakuFontSize',
      'playback.danmakuSpeed',
      'playback.isDanmakuAntiOverlap'
    )
    or item_key like 'playback.danmaku%'
    or item_key like 'playback.isDanmaku%'
  );

-- ---------------------------------------------------------------------
-- [Migration] 202610290001_watch_party_rooms.sql
-- ---------------------------------------------------------------------

-- Apply after the managed-account migration. Room records retain closed identifiers.
create table if not exists public.watch_party_rooms (
  room_id text primary key check (room_id ~ '^[a-z0-9]{7}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('host_only', 'collaborative', 'guest_cinema')),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.watch_party_rooms enable row level security;
revoke all on public.watch_party_rooms from public, anon, authenticated;

create or replace function public.create_watch_party_room(p_room_id text, p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.account_is_active() then
    raise exception 'Active account required';
  end if;
  insert into public.watch_party_rooms (room_id, owner_id, mode)
  values (p_room_id, auth.uid(), p_mode);
end;
$$;

create or replace function public.close_watch_party_room(p_room_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.account_is_active() then
    raise exception 'Active account required';
  end if;
  update public.watch_party_rooms set closed_at = coalesce(closed_at, now())
  where room_id = p_room_id and owner_id = auth.uid();
  if not found then raise exception 'Room not found or not owned by account'; end if;
end;
$$;

create or replace function public.watch_party_room_status(p_room_id text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select case when closed_at is null then 'open' else 'closed' end
    from public.watch_party_rooms where room_id = p_room_id), 'missing');
$$;

revoke all on function public.create_watch_party_room(text, text) from public, anon;
revoke all on function public.close_watch_party_room(text) from public, anon;
revoke all on function public.watch_party_room_status(text) from public;
grant execute on function public.create_watch_party_room(text, text) to authenticated;
grant execute on function public.close_watch_party_room(text) to authenticated;
grant execute on function public.watch_party_room_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- [Migration] 202610290002_private_playback_lease.sql
-- ---------------------------------------------------------------------

-- Update an owned lease when private mode changes.
begin;

create or replace function public.playback_lease(
  p_operation text,
  p_player uuid,
  p_lease uuid default null,
  p_takeover uuid default null,
  p_device_label text default '',
  p_media_key text default '',
  p_title text default '',
  p_position double precision default null,
  p_duration double precision default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  previous public.account_playback%rowtype;
  lease_clock timestamptz;
  next_lease uuid;
  resume_position double precision := null;
begin
  if not public.account_is_active() or sid is null then raise exception 'Inactive account'; end if;
  if p_player is null or p_operation is null or p_operation not in ('acquire', 'renew', 'release') then
    raise exception 'Invalid playback operation';
  end if;
  if p_position is not null and not (p_position >= 0 and p_position < 1000000000) then
    raise exception 'Invalid position';
  end if;
  if p_duration is not null and not (p_duration >= 0 and p_duration < 1000000000) then
    raise exception 'Invalid duration';
  end if;
  -- Serialize even first-time claims; the lease row might not exist yet.
  perform 1 from public.user_accounts a where a.id = uid for update;
  lease_clock := clock_timestamp();
  select * into previous from public.account_playback p where p.user_id = uid for update;

  if p_operation = 'acquire' then
    if length(p_media_key) not between 1 and 2048 then raise exception 'Invalid media key'; end if;
    if previous.user_id is not null and previous.expires_at > lease_clock
       and not (previous.player_id = p_player and previous.session_id = sid)
       and p_takeover is distinct from previous.lease_id then
      return jsonb_build_object('status', 'busy', 'lease_id', previous.lease_id,
        'device_label', previous.device_label, 'title', previous.title);
    end if;
    if previous.media_key = p_media_key and previous.player_id <> p_player then
      resume_position := previous.position;
    end if;
    next_lease := case when previous.player_id = p_player and previous.session_id = sid
      and previous.expires_at > lease_clock then previous.lease_id else gen_random_uuid() end;
    insert into public.account_playback as p
      (user_id, session_id, player_id, lease_id, device_label, media_key, title, position, duration, expires_at)
    values (uid, sid, p_player, next_lease, left(p_device_label, 160), p_media_key, left(p_title, 300),
      coalesce(resume_position, p_position, 0), coalesce(p_duration, 0), lease_clock + interval '30 seconds')
    on conflict (user_id) do update set session_id = excluded.session_id,
      player_id = excluded.player_id, lease_id = excluded.lease_id,
      device_label = excluded.device_label, media_key = excluded.media_key, title = excluded.title,
      position = excluded.position, duration = excluded.duration, expires_at = excluded.expires_at;
    return jsonb_build_object('status', 'held', 'lease_id', next_lease,
      'resume_position', resume_position, 'media_key', p_media_key, 'ttl_ms', 30000);
  end if;

  if previous.player_id is distinct from p_player or previous.session_id is distinct from sid
     or previous.lease_id is distinct from p_lease or previous.expires_at <= lease_clock then
    return jsonb_build_object('status', 'lost');
  end if;
  if length(p_media_key) not between 1 and 2048 then raise exception 'Invalid media key'; end if;
  update public.account_playback p set
    media_key = p_media_key,
    title = left(p_title, 300),
    position = coalesce(p_position, p.position),
    duration = coalesce(p_duration, p.duration),
    expires_at = case when p_operation = 'release' then lease_clock else lease_clock + interval '30 seconds' end
  where p.user_id = uid;
  return jsonb_build_object('status', case when p_operation = 'release' then 'released' else 'held' end,
    'lease_id', previous.lease_id, 'media_key', p_media_key, 'ttl_ms', 30000);
end;
$$;

commit;
