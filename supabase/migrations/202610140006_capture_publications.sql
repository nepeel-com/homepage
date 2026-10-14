begin;
-- Only the verifier can reserve a publication. Retries cannot change its content.
create table public.capture_publications (
  challenge_id uuid primary key references public.capture_challenges on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  post_id uuid unique not null default gen_random_uuid(),
  image_path text generated always as (user_id::text || '/' || post_id::text || '.jpg') stored,
  image_sha256 text not null check (image_sha256 ~ '^[a-f0-9]{64}$'),
  caption text not null check (char_length(caption) <= 1000),
  platform text not null check (platform in ('ios','android')),
  captured_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','published','abandoned')),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index pending_publications_idx on public.capture_publications(expires_at) where state='pending';
alter table public.capture_publications enable row level security;
revoke all on public.capture_publications from public,anon,authenticated;
grant all on public.capture_publications to service_role;

-- Allow bounded in-flight server uploads to finish before cleaning their paths.
alter table public.media_cleanup_jobs add column not_before timestamptz not null default now();

create function public.reserve_capture_publication(
  p_id uuid, p_user uuid, p_hash text, p_caption text, p_platform text,
  p_key text default null, p_previous bigint default null, p_next bigint default null
) returns setof public.capture_publications
language plpgsql security definer set search_path = '' as $$
declare c public.capture_challenges; r public.capture_publications;
begin
  select * into c from public.capture_challenges where id=p_id and user_id=p_user for update;
  if not found then raise exception 'Capture unavailable'; end if;
  select * into r from public.capture_publications where challenge_id=p_id;
  if found then
    if r.user_id is distinct from p_user or r.image_sha256 is distinct from p_hash
      or r.caption is distinct from p_caption or r.platform is distinct from p_platform then
      raise exception 'Capture content changed';
    end if;
    return next r; return;
  end if;
  -- Nonce and assertion counter are consumed in the same transaction as the receipt.
  perform public.claim_capture(p_id,p_user,p_key,p_previous,p_next);
  return query insert into public.capture_publications(challenge_id,user_id,image_sha256,caption,platform,captured_at)
    values(p_id,p_user,p_hash,p_caption,p_platform,c.created_at) returning *;
end; $$;

create function public.finish_capture_publication(p_id uuid,p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.capture_publications;
begin
  select * into r from public.capture_publications where challenge_id=p_id and user_id=p_user for update;
  if not found then raise exception 'Capture unavailable'; end if;
  if r.state='published' then return r.post_id; end if;
  if r.state<>'pending' or r.expires_at<=now() then raise exception 'Capture unavailable'; end if;
  insert into public.posts(id,user_id,image_path,image_sha256,caption,platform,captured_at)
    values(r.post_id,r.user_id,r.image_path,r.image_sha256,r.caption,r.platform,r.captured_at);
  update public.capture_publications set state='published' where challenge_id=p_id;
  return r.post_id;
end; $$;

create or replace function public.queue_deleted_media() returns trigger
language plpgsql security definer set search_path = '' as $$
declare delayed boolean;
begin
  update public.capture_publications set state='abandoned' where post_id=old.id;
  delayed := found;
  insert into public.media_cleanup_jobs(user_id,image_path,not_before)
    values(old.user_id,old.image_path,now()+case when delayed then interval '2 minutes' else interval '0 seconds' end)
    on conflict(image_path) do update set not_before=greatest(public.media_cleanup_jobs.not_before,excluded.not_before);
  return old;
end; $$;

create function public.queue_unfinished_capture() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Published posts survive challenge/receipt retention cleanup.
  if old.state<>'published' or not exists(select 1 from public.profiles where id=old.user_id) then
    insert into public.media_cleanup_jobs(user_id,image_path,not_before)
      values(old.user_id,old.image_path,now()+interval '2 minutes')
      on conflict(image_path) do update set not_before=greatest(public.media_cleanup_jobs.not_before,excluded.not_before);
  end if;
  return old;
end; $$;
create trigger cleanup_unfinished_capture before delete on public.capture_publications
for each row execute function public.queue_unfinished_capture();

create function public.expire_capture_publications() returns integer
language plpgsql security definer set search_path = '' as $$
declare r public.capture_publications; n integer := 0;
begin
  for r in select * from public.capture_publications where state='pending' and expires_at<=now()
    order by expires_at limit 500 for update skip locked loop
    update public.capture_publications set state='abandoned' where challenge_id=r.challenge_id;
    insert into public.media_cleanup_jobs(user_id,image_path,not_before)
      values(r.user_id,r.image_path,now()+interval '2 minutes')
      on conflict(image_path) do update set not_before=greatest(public.media_cleanup_jobs.not_before,excluded.not_before);
    n := n+1;
  end loop;
  -- Bound retention even for members who never request another challenge.
  delete from public.capture_challenges where id in (
    select id from public.capture_challenges where created_at<now()-interval '1 day'
      order by created_at limit 1000 for update skip locked
  );
  return n;
end; $$;
revoke all on function public.reserve_capture_publication,public.finish_capture_publication,
  public.queue_unfinished_capture,public.expire_capture_publications from public,anon,authenticated;
grant execute on function public.reserve_capture_publication,public.finish_capture_publication,
  public.expire_capture_publications to service_role;
commit;
