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
