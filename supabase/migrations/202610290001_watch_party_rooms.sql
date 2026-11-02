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
