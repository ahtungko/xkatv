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
