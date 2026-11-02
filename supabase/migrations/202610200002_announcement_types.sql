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
