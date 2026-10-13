-- Additive, opt-in adult introductions. Birthdates/preferences are private.
begin;
create table public.connection_preferences (
  user_id uuid primary key references public.profiles on delete cascade,
  birth_date date not null,
  gender text not null check (gender in ('woman','man','nonbinary')),
  interested_in text[] not null check (cardinality(interested_in) between 1 and 3 and interested_in <@ array['woman','man','nonbinary']),
  city text not null check (city in ('seoul','busan','tokyo','osaka','singapore','taipei','hongkong','london','paris','berlin','newyork','losangeles','toronto','sydney','other')),
  scope text not null check (scope in ('city','global')),
  intent text not null check (intent in ('friends','dating')),
  age_min integer not null check (age_min between 18 and 100),
  age_max integer not null check (age_max between age_min and 100),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check (scope <> 'city' or city <> 'other')
);
create index connection_pool on public.connection_preferences(intent,city,updated_at desc) where enabled;
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.profiles on delete cascade,
  member_b uuid not null references public.profiles on delete cascade,
  initiator uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  check(member_a < member_b), check(initiator in (member_a,member_b)), unique(member_a,member_b)
);
create index connections_a on public.connections(member_a,updated_at desc);
create index connections_b on public.connections(member_b,updated_at desc);
create index connection_daily_quota on public.connections(initiator,created_at desc);
create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections on delete cascade,
  sender_id uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique(sender_id,client_id)
);
create index message_history on public.direct_messages(connection_id,created_at desc,id desc);
create index message_quota on public.direct_messages(sender_id,created_at desc);
create table public.connection_blocks (
  user_id uuid not null references public.profiles on delete cascade,
  blocked_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,blocked_id), check(user_id<>blocked_id)
);
create index connection_blocks_reverse on public.connection_blocks(blocked_id,user_id);
create table public.connection_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  connection_id uuid not null references public.connections on delete cascade,
  reason text not null check (reason in ('spam','harassment','underage','other')),
  created_at timestamptz not null default now(),
  unique(user_id,connection_id)
);
alter table public.connection_preferences enable row level security;
alter table public.connections enable row level security;
alter table public.direct_messages enable row level security;
alter table public.connection_blocks enable row level security;
alter table public.connection_reports enable row level security;
revoke all on public.connection_preferences,public.connections,public.direct_messages,public.connection_blocks,public.connection_reports from anon,authenticated;
grant select on public.connection_preferences,public.connections,public.direct_messages,public.connection_blocks to authenticated;
grant all on public.connection_preferences,public.connections,public.direct_messages,public.connection_blocks,public.connection_reports to service_role;
create policy own_connection_preferences on public.connection_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy own_connections on public.connections for select to authenticated using((select auth.uid()) in (member_a,member_b));
create policy own_connection_blocks on public.connection_blocks for select to authenticated using(user_id=(select auth.uid()));
-- A blocked connection is retained for moderation but no longer readable as messages.
create policy own_messages on public.direct_messages for select to authenticated using(exists(
  select 1 from public.connections c where c.id=connection_id and (select auth.uid()) in(c.member_a,c.member_b) and c.status<>'blocked'
));

create function public.save_connection_preferences(p_birth_date date,p_gender text,p_interested_in text[],p_city text,p_scope text,p_intent text,p_age_min integer,p_age_max integer,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); existing date;
begin
  if u is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_birth_date is null or p_birth_date>current_date-interval '18 years' or p_birth_date<current_date-interval '100 years' then raise exception 'ADULTS_ONLY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,41));
  select birth_date into existing from public.connection_preferences where user_id=u;
  if existing is not null and existing<>p_birth_date then raise exception 'BIRTH_DATE_LOCKED'; end if;
  insert into public.connection_preferences(user_id,birth_date,gender,interested_in,city,scope,intent,age_min,age_max,enabled)
  values(u,p_birth_date,p_gender,p_interested_in,p_city,p_scope,p_intent,p_age_min,p_age_max,p_enabled)
  on conflict(user_id) do update set gender=excluded.gender,interested_in=excluded.interested_in,city=excluded.city,scope=excluded.scope,intent=excluded.intent,age_min=excluded.age_min,age_max=excluded.age_max,enabled=excluded.enabled,updated_at=now();
end; $$;

create function public.pause_connections() returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.connection_preferences set enabled=false,updated_at=now() where user_id=auth.uid();
end; $$;

create function public.send_random_hi() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); me public.connection_preferences; peer uuid; cid uuid; myage integer;
begin
  if u is null then raise exception 'AUTH_REQUIRED'; end if;
  -- One request at a time per sender, including across devices/tabs.
  perform pg_advisory_xact_lock(hashtextextended(u::text,41));
  select * into me from public.connection_preferences where user_id=u for update;
  if not found or not me.enabled then raise exception 'OPT_IN_REQUIRED'; end if;
  myage:=extract(year from age(current_date,me.birth_date));
  if myage<18 or myage>100 then raise exception 'ADULTS_ONLY'; end if;
  if (select count(*) from public.connections where initiator=u and created_at>now()-interval '24 hours')>=5 then raise exception 'DAILY_HI_LIMIT'; end if;
  if exists(select 1 from public.connections where initiator=u and created_at>now()-interval '1 minute') then raise exception 'HI_COOLDOWN'; end if;
  update public.connection_preferences set updated_at=now() where user_id=u;
  -- Skip busy candidate rows; bounded age/city/intent pool. No exact location is collected.
  with candidates as (
  select p.user_id from public.connection_preferences p
  where p.user_id<>u and p.enabled and p.updated_at>now()-interval '7 days'
    and p.intent=me.intent and p.gender=any(me.interested_in) and me.gender=any(p.interested_in)
    and extract(year from age(current_date,p.birth_date)) between greatest(18,me.age_min) and me.age_max
    and myage between p.age_min and p.age_max
    and ((me.scope='global' and p.scope='global') or (me.city=p.city and me.city<>'other'))
    and not exists(select 1 from public.connections c where c.member_a=least(u,p.user_id) and c.member_b=greatest(u,p.user_id))
    and not exists(select 1 from public.connection_blocks b where (b.user_id=u and b.blocked_id=p.user_id) or (b.user_id=p.user_id and b.blocked_id=u))
    and (select count(*) from public.connections c where c.status='pending' and c.expires_at>now() and p.user_id in(c.member_a,c.member_b))<10
  order by p.updated_at desc limit 200
  )
  select p.user_id into peer from public.connection_preferences p join candidates x on x.user_id=p.user_id
  where p.enabled order by random() limit 1 for update of p skip locked;
  if peer is null then return null; end if;
  insert into public.connections(member_a,member_b,initiator) values(least(u,peer),greatest(u,peer),u) returning id into cid;
  insert into public.direct_messages(connection_id,sender_id,body,client_id) values(cid,u,'hi',gen_random_uuid());
  return cid;
end; $$;

create function public.respond_to_hi(p_connection uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.connections;
begin
  select * into c from public.connections where id=p_connection and u in(member_a,member_b) for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if c.initiator=u or c.status<>'pending' or c.expires_at<=now() or p_accept is null then raise exception 'REQUEST_CLOSED'; end if;
  if p_accept and (select count(*) from public.connection_preferences where user_id in(c.member_a,c.member_b) and birth_date<=current_date-interval '18 years')<>2 then raise exception 'ADULTS_ONLY'; end if;
  update public.connections set status=case when p_accept then 'accepted' else 'declined' end,updated_at=now() where id=c.id;
end; $$;

create function public.send_direct_message(p_connection uuid,p_body text,p_client_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.connections; result uuid;
begin
  if u is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_client_id is null or p_body is null or char_length(trim(p_body)) not between 1 and 1000 then raise exception 'INVALID_MESSAGE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,42));
  select * into c from public.connections where id=p_connection and u in(member_a,member_b) for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if c.status<>'accepted' then raise exception 'REQUEST_CLOSED'; end if;
  select id into result from public.direct_messages where sender_id=u and client_id=p_client_id and connection_id=c.id;
  if found then return result; end if;
  if (select count(*) from public.direct_messages where sender_id=u and created_at>now()-interval '10 minutes')>=60 then raise exception 'MESSAGE_LIMIT'; end if;
  insert into public.direct_messages(connection_id,sender_id,body,client_id) values(c.id,u,trim(p_body),p_client_id) returning id into result;
  update public.connections set updated_at=now() where id=c.id;
  return result;
end; $$;

create function public.block_connection(p_connection uuid,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.connections; peer uuid;
begin
  select * into c from public.connections where id=p_connection and u in(member_a,member_b) for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  peer:=case when c.member_a=u then c.member_b else c.member_a end;
  insert into public.connection_blocks(user_id,blocked_id) values(u,peer) on conflict do nothing;
  if p_reason is not null then
    insert into public.connection_reports(user_id,connection_id,reason) values(u,c.id,p_reason) on conflict(user_id,connection_id) do nothing;
  end if;
  update public.connections set status='blocked',updated_at=now() where id=c.id;
end; $$;

create function public.get_connections(p_before timestamptz default null,p_before_id uuid default null)
returns table(id uuid,peer_id uuid,display_name text,username text,status text,incoming boolean,updated_at timestamptz,expires_at timestamptz,city text,age_band text,intent text)
language sql stable security definer set search_path='' as $$
  select c.id,p.id,p.display_name,p.username,
    case when c.status='pending' and c.expires_at<=now() then 'expired' else c.status end,
    c.initiator<>auth.uid(),c.updated_at,c.expires_at,pr.city,
    greatest(18,(floor(extract(year from age(current_date,pr.birth_date))/5)*5)::integer)::text||'–'||(floor(extract(year from age(current_date,pr.birth_date))/5)*5+4)::integer::text,
    pr.intent
  from public.connections c join public.profiles p on p.id=case when c.member_a=auth.uid() then c.member_b else c.member_a end
  join public.connection_preferences pr on pr.user_id=p.id
  where auth.uid() in(c.member_a,c.member_b)
    and (p_before is null or (c.updated_at,c.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by c.updated_at desc,c.id desc limit 30;
$$;
create function public.get_direct_messages(p_connection uuid,p_before timestamptz default null,p_before_id uuid default null)
returns setof public.direct_messages language sql stable security invoker set search_path='' as $$
  select m.* from public.direct_messages m where m.connection_id=p_connection
    and (p_before is null or (m.created_at,m.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by m.created_at desc,m.id desc limit 40;
$$;

revoke all on function public.save_connection_preferences,public.pause_connections,public.send_random_hi,public.respond_to_hi,public.send_direct_message,public.block_connection,public.get_connections,public.get_direct_messages from public,anon;
grant execute on function public.save_connection_preferences,public.pause_connections,public.send_random_hi,public.respond_to_hi,public.send_direct_message,public.block_connection,public.get_connections,public.get_direct_messages to authenticated;
-- Supabase only: enable private table change notifications, still governed by RLS.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.connections,public.direct_messages;
  end if;
end $$;
commit;
