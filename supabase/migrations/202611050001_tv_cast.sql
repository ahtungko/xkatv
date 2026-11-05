-- Capability-authorized TV sessions; no public Realtime topics.
create table public.tv_cast_sessions (
 id uuid primary key default gen_random_uuid(),
 pin text unique not null,
 receiver_token uuid not null default gen_random_uuid(),
 controller_token uuid,
 owner_id uuid references auth.users(id) on delete cascade,
 accepted boolean not null default false,
 expires_at timestamptz not null default now() + interval '5 minutes'
);
create table public.tv_cast_attempts (user_id uuid primary key, started_at timestamptz not null, attempts integer not null);
create table public.tv_cast_events (
 id bigint generated always as identity primary key,
 session_id uuid not null references public.tv_cast_sessions on delete cascade,
 sender text not null,
 payload jsonb not null
);
alter table public.tv_cast_sessions enable row level security;
alter table public.tv_cast_attempts enable row level security;
alter table public.tv_cast_events enable row level security;
revoke all on public.tv_cast_sessions, public.tv_cast_attempts, public.tv_cast_events from public, anon, authenticated;

create function public.tv_cast(p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 s public.tv_cast_sessions;
 role_name text;
 attempt_count integer;
 result jsonb;
 token uuid;
begin
 if p_action = 'create' then
   delete from public.tv_cast_sessions where expires_at < now();
   loop
     begin
       insert into public.tv_cast_sessions(pin) values (lpad(floor(random()*10000)::text,4,'0')) returning * into s;
       exit;
     exception when unique_violation then
       if (select count(*) from public.tv_cast_sessions) >= 9000 then raise exception 'Pairing capacity reached'; end if;
     end;
   end loop;
   return jsonb_build_object('id',s.id,'token',s.receiver_token,'pin',s.pin);
 end if;
 if p_action = 'pair' then
   if auth.uid() is null or not public.account_is_active() then raise exception 'Login required'; end if;
   insert into public.tv_cast_attempts values(auth.uid(),now(),1)
   on conflict(user_id) do update set
     attempts = case when tv_cast_attempts.started_at < now()-interval '1 minute' then 1 else tv_cast_attempts.attempts+1 end,
     started_at = case when tv_cast_attempts.started_at < now()-interval '1 minute' then now() else tv_cast_attempts.started_at end
   returning attempts into attempt_count;
   -- Return errors rather than raising so failed attempts remain committed.
   if attempt_count > 5 then return jsonb_build_object('error','尝试过多，请一分钟后重试'); end if;
   select * into s from public.tv_cast_sessions where pin = p_data->>'pin' and expires_at > now() for update;
   if not found or s.owner_id is not null then return jsonb_build_object('error','配对码无效、已使用或已过期'); end if;
   token := gen_random_uuid();
   update public.tv_cast_sessions set owner_id=auth.uid(), controller_token=token where id=s.id;
   insert into public.tv_cast_events(session_id,sender,payload) values(s.id,'controller',jsonb_build_object('type','connect_request','senderId',auth.uid(),'senderName','手机控制端'));
   return jsonb_build_object('id',s.id,'token',token,'pin',s.pin);
 end if;
 select * into s from public.tv_cast_sessions where id=(p_data->>'id')::uuid and expires_at>now() for update;
 if not found then raise exception 'Session expired'; end if;
 token := (p_data->>'token')::uuid;
 if token=s.receiver_token then role_name := 'receiver';
 elsif token=s.controller_token and s.owner_id=auth.uid() and public.account_is_active() then role_name := 'controller';
 else raise exception 'Unauthorized'; end if;
 if p_action='close' then
   delete from public.tv_cast_sessions where id=s.id;
   return '{}'::jsonb;
 end if;
 if p_action='poll' then
   select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'payload',e.payload) order by e.id),'[]'::jsonb) into result
   from (select * from public.tv_cast_events where session_id=s.id and sender<>role_name and id>coalesce((p_data->>'cursor')::bigint,0) order by id limit 100) e;
   return result;
 end if;
 if p_action='send' then
   if octet_length((p_data->'payload')::text)>16000 then raise exception 'Message too large'; end if;
   if role_name='receiver' then
     if p_data->'payload'->>'type' not in ('connect_ack','progress','ended','error','disconnect') then raise exception 'Invalid event'; end if;
     if p_data->'payload'->>'type'='connect_ack' then
       if s.owner_id is null then raise exception 'No controller'; end if;
       update public.tv_cast_sessions set accepted=true, expires_at=now()+interval '6 hours' where id=s.id;
     end if;
   elsif not s.accepted or p_data->'payload'->>'type' not in ('load_media','command','disconnect') then raise exception 'TV confirmation required';
   end if;
   insert into public.tv_cast_events(session_id,sender,payload) values(s.id,role_name,p_data->'payload');
   delete from public.tv_cast_events where session_id=s.id and id < (select coalesce(max(id),0)-1000 from public.tv_cast_events where session_id=s.id);
   return '{}'::jsonb;
 end if;
 raise exception 'Unknown action';
end;
$$;
revoke all on function public.tv_cast(text,jsonb) from public;
grant execute on function public.tv_cast(text,jsonb) to anon, authenticated;
