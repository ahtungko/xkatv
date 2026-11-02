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
