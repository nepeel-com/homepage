begin;
-- Remember the state before the first block. Older blocks stay closed because
-- their original acceptance state was not recorded.
alter table public.connections add column resume_status text
  check (resume_status in ('pending','accepted','declined'));
update public.connections set resume_status='declined' where status='blocked';

create or replace function public.block_connection(p_connection uuid,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.connections; peer uuid;
begin
  if not public.is_active_member() then raise exception 'AUTH_REQUIRED'; end if;
  select * into c from public.connections where id=p_connection and u in(member_a,member_b) for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  peer:=case when c.member_a=u then c.member_b else c.member_a end;
  insert into public.connection_blocks(user_id,blocked_id) values(u,peer) on conflict do nothing;
  if p_reason is not null then
    insert into public.connection_reports(user_id,connection_id,reason) values(u,c.id,p_reason) on conflict(user_id,connection_id) do nothing;
  end if;
  update public.connections set
    resume_status=case when status='blocked' then resume_status else status end,
    status='blocked',updated_at=now() where id=c.id;
end; $$;

create function public.get_blocked_connections(p_before timestamptz default null,p_before_id uuid default null)
returns table(connection_id uuid,peer_id uuid,display_name text,username text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select c.id,p.id,p.display_name,p.username,b.created_at
  from public.connection_blocks b join public.profiles p on p.id=b.blocked_id
  join public.connections c on c.member_a=least(b.user_id,b.blocked_id) and c.member_b=greatest(b.user_id,b.blocked_id)
  where b.user_id=auth.uid() and public.is_active_member()
    and (p_before is null or (b.created_at,b.blocked_id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by b.created_at desc,b.blocked_id desc limit 30;
$$;

create function public.unblock_connection(p_connection uuid) returns text
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.connections; peer uuid; removed integer; next_status text;
begin
  if not public.is_active_member() then raise exception 'AUTH_REQUIRED'; end if;
  -- The same row lock as blocking/sending serializes changes across both people.
  select * into c from public.connections where id=p_connection and u in(member_a,member_b) for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  peer:=case when c.member_a=u then c.member_b else c.member_a end;
  delete from public.connection_blocks where user_id=u and blocked_id=peer;
  get diagnostics removed = row_count;
  if removed=0 then return c.status; end if;
  if exists(select 1 from public.connection_blocks where user_id=peer and blocked_id=u) then
    next_status:='blocked';
  else
    next_status:=coalesce(c.resume_status,'declined');
  end if;
  update public.connections set status=next_status,
    resume_status=case when next_status='blocked' then resume_status else null end,
    updated_at=now() where id=c.id;
  -- Reports, original invitation expiry, and quota timestamps are unchanged.
  return next_status;
end; $$;

revoke all on function public.get_blocked_connections,public.unblock_connection from public,anon;
grant execute on function public.get_blocked_connections,public.unblock_connection to authenticated;
commit;
