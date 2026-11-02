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
