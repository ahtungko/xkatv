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
