-- Store global site feature flags and configuration accessible to all users, editable only by admins.
create table if not exists public.site_settings (
  key text primary key check (length(key) <= 100),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Leave feature flags unset until an administrator saves an override.
-- A missing value lets clients retain their environment/initial configuration.

alter table public.site_settings enable row level security;
alter table public.site_settings replica identity full;
revoke all on public.site_settings from public, anon, authenticated;

-- Allow reading site settings to all active accounts and anonymous visitors
drop policy if exists "Read site settings" on public.site_settings;
create policy "Read site settings" on public.site_settings
for select to anon, authenticated using (true);
grant select on public.site_settings to anon, authenticated;

-- Allow admin to insert/update/delete
drop policy if exists "Admin manage site settings" on public.site_settings;
create policy "Admin manage site settings" on public.site_settings
for all to authenticated
using (
  public.account_is_active() and exists (
    select 1 from public.user_accounts
    where id = auth.uid() and role = 'admin'
  )
)
with check (
  public.account_is_active() and exists (
    select 1 from public.user_accounts
    where id = auth.uid() and role = 'admin'
  )
);
grant insert, update, delete on public.site_settings to authenticated;

-- Helper RPC function to get a setting
create or replace function public.get_site_setting(p_key text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return (select value from public.site_settings where key = p_key);
end;
$$;
revoke all on function public.get_site_setting(text) from public;
grant execute on function public.get_site_setting(text) to anon, authenticated;

-- Helper RPC function to set a setting (admin only)
create or replace function public.set_site_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.account_is_active() or not exists (
    select 1 from public.user_accounts where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Admin required' using errcode = '42501';
  end if;

  insert into public.site_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update set
    value = excluded.value,
    updated_at = now();
end;
$$;
revoke all on function public.set_site_setting(text, jsonb) from public, anon;
grant execute on function public.set_site_setting(text, jsonb) to authenticated;

-- Enable change delivery on standard Supabase installations; tolerate local databases.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'site_settings'
     ) then
    alter publication supabase_realtime add table public.site_settings;
  end if;
end;
$$;
