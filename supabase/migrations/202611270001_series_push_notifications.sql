-- External push notification channels (Telegram, Discord, Generic Webhook)
-- and background checker RPCs/metadata for series update notifications.
-- Apply after 202610190001_series_notifications.sql.

create table if not exists public.user_notification_channels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  telegram_enabled boolean not null default false,
  telegram_bot_token text not null default '' check (length(telegram_bot_token) <= 256),
  telegram_chat_id text not null default '' check (length(telegram_chat_id) <= 128),
  discord_enabled boolean not null default false,
  discord_webhook_url text not null default '' check (length(discord_webhook_url) <= 2048),
  webhook_enabled boolean not null default false,
  webhook_url text not null default '' check (length(webhook_url) <= 2048),
  webhook_secret text not null default '' check (length(webhook_secret) <= 256),
  updated_at timestamptz not null default now()
);

alter table public.user_notification_channels enable row level security;

drop policy if exists "Own active account notification channels select" on public.user_notification_channels;
create policy "Own active account notification channels select"
  on public.user_notification_channels
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.account_is_active()));

drop policy if exists "Own active account notification channels insert" on public.user_notification_channels;
create policy "Own active account notification channels insert"
  on public.user_notification_channels
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.account_is_active()));

drop policy if exists "Own active account notification channels update" on public.user_notification_channels;
create policy "Own active account notification channels update"
  on public.user_notification_channels
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.account_is_active()))
  with check (user_id = (select auth.uid()) and (select public.account_is_active()));

drop policy if exists "Own active account notification channels delete" on public.user_notification_channels;
create policy "Own active account notification channels delete"
  on public.user_notification_channels
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.account_is_active()));

revoke all on public.user_notification_channels from public, anon, authenticated;
grant select, insert, update, delete on public.user_notification_channels to authenticated;
grant all on public.user_notification_channels to service_role;

-- Background-check metadata on series_notifications so the Cron Worker
-- can rotate through the oldest unchecked resources and skip completed shows.
alter table public.series_notifications
  add column if not exists last_checked_at timestamptz,
  add column if not exists source_completed boolean not null default false,
  add column if not exists title text not null default '';

create index if not exists idx_series_notifications_bg_check
  on public.series_notifications (source_completed, last_checked_at asc nulls first);

-- Service-role RPC: loads enabled channels (active accounts only) and due
-- series_notifications rows that still correspond to an actively tracked favorite
-- (matching current season tracking_key and binding_key).
create or replace function public.get_due_series_notifications(
  p_cooldown_hours integer default 2,
  p_limit integer default 200
)
returns jsonb language sql stable security definer set search_path = '' as $$
  with eligible_channels as (
    select c.*
    from public.user_notification_channels c
    join public.user_accounts a on a.id = c.user_id
    where a.enabled = true
      and c.enabled = true
      and (c.telegram_enabled or c.discord_enabled or c.webhook_enabled)
  ),
  active_favorites as (
    select
      f.user_id,
      coalesce(f.value ->> 'id', f.item_key) || '::' || (
        case
          when (f.value ->> 'sourceType') = 'tmdb'
            then coalesce(nullif(f.value -> 'tracking' ->> 'seasonNumber', ''), '1')
          else 'cms'
        end
      ) as expected_tracking_key,
      (f.value -> 'tracking' -> 'bindings') -> (
        case
          when (f.value ->> 'sourceType') = 'tmdb'
            then coalesce(nullif(f.value -> 'tracking' ->> 'seasonNumber', ''), '1')
          else 'cms'
        end
      ) as binding,
      coalesce(
        nullif(f.value -> 'media' ->> 'title', ''),
        nullif(f.value -> 'media' ->> 'vodName', ''),
        ''
      ) as fav_title
    from public.user_sync_records f
    join eligible_channels ec on ec.user_id = f.user_id
    where f.kind = 'favorite'
      and f.deleted = false
      and (f.value -> 'tracking' ->> 'enabled') = 'true'
  ),
  due_items as (
    select
      n.user_id,
      n.resource_hash,
      n.tracking_key,
      n.source_code,
      n.vod_id,
      n.known_episodes,
      coalesce(nullif(n.title, ''), fav.fav_title, '') as title,
      n.last_checked_at
    from public.series_notifications n
    join active_favorites fav
      on fav.user_id = n.user_id
      and fav.expected_tracking_key = n.tracking_key
      and (
        case
          when fav.binding is null or jsonb_typeof(fav.binding) <> 'object'
            then n.binding_key = 'auto'
          else n.binding_key ~ '^\[.*\]$'
            and n.binding_key::jsonb = jsonb_build_array(
              coalesce(fav.binding ->> 'sourceCode', ''),
              coalesce(fav.binding ->> 'vodId', '')
            )
        end
      )
    where n.source_completed = false
      and (
        n.last_checked_at is null
        or n.last_checked_at < now() - make_interval(hours => greatest(0, coalesce(p_cooldown_hours, 2)))
      )
    order by n.last_checked_at asc nulls first, n.user_id, n.resource_hash
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  )
  select jsonb_build_object(
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', ec.user_id,
        'telegram_enabled', ec.telegram_enabled,
        'telegram_bot_token', ec.telegram_bot_token,
        'telegram_chat_id', ec.telegram_chat_id,
        'discord_enabled', ec.discord_enabled,
        'discord_webhook_url', ec.discord_webhook_url,
        'webhook_enabled', ec.webhook_enabled,
        'webhook_url', ec.webhook_url,
        'webhook_secret', ec.webhook_secret
      ))
      from eligible_channels ec
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', d.user_id,
        'resource_hash', d.resource_hash,
        'tracking_key', d.tracking_key,
        'source_code', d.source_code,
        'vod_id', d.vod_id,
        'known_episodes', d.known_episodes,
        'title', d.title
      ))
      from due_items d
    ), '[]'::jsonb)
  );
$$;

-- Service-role RPC: atomically updates checked series_notifications rows in one
-- round-trip, unioning known_episodes so concurrent client updates are never lost
-- and read_episodes remain untouched.
create or replace function public.batch_update_series_notifications(p_updates jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_known integer[];
  v_updated integer := 0;
  v_row_count integer := 0;
begin
  if jsonb_typeof(p_updates) is distinct from 'array' then
    raise exception 'Expected updates array';
  end if;
  if jsonb_array_length(p_updates) > 500 then
    raise exception 'Expected at most 500 updates';
  end if;

  for r in select value from jsonb_array_elements(p_updates) loop
    v_known := public.series_parse_episodes(r -> 'knownEpisodes');
    if cardinality(v_known) = 0 then
      continue;
    end if;

    update public.series_notifications n set
      known_episodes = array(
        select ep
        from unnest(public.series_episode_union(n.known_episodes, v_known)) as ep
        order by ep
        limit 9999
      ),
      last_checked_at = coalesce(nullif(r ->> 'lastCheckedAt', '')::timestamptz, now()),
      source_completed = coalesce((r ->> 'sourceCompleted')::boolean, n.source_completed),
      title = case
        when coalesce(r ->> 'title', '') <> '' then left(r ->> 'title', 300)
        else n.title
      end
    where n.user_id = (r ->> 'userId')::uuid
      and n.resource_hash = (r ->> 'resourceHash');

    get diagnostics v_row_count = row_count;
    v_updated := v_updated + v_row_count;
  end loop;

  return v_updated;
end;
$$;

revoke all on function public.get_due_series_notifications(integer, integer) from public, anon, authenticated;
grant execute on function public.get_due_series_notifications(integer, integer) to service_role;

revoke all on function public.batch_update_series_notifications(jsonb) from public, anon, authenticated;
grant execute on function public.batch_update_series_notifications(jsonb) to service_role;
