begin;
-- Survives profile deletion so failed object cleanup can be retried safely.
create table public.media_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  image_path text unique not null,
  created_at timestamptz not null default now(),
  attempted_at timestamptz
);
create index cleanup_attempt_idx on public.media_cleanup_jobs(attempted_at nulls first, created_at);
alter table public.media_cleanup_jobs enable row level security;
revoke all on public.media_cleanup_jobs from public, anon, authenticated;
grant all on public.media_cleanup_jobs to service_role;
create function public.queue_deleted_media() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.media_cleanup_jobs(user_id,image_path) values(old.user_id,old.image_path)
    on conflict(image_path) do nothing;
  return old;
end; $$;
revoke all on function public.queue_deleted_media() from public,anon,authenticated;
create trigger queue_post_media before delete on public.posts
for each row execute function public.queue_deleted_media();

-- A deleted account's already-issued JWT must not retain member read access.
create function public.is_active_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=auth.uid());
$$;
revoke all on function public.is_active_member() from public,anon;
grant execute on function public.is_active_member() to authenticated;
do $$ declare t text; begin
  foreach t in array array['profiles','posts','likes','bookmarks','follows','comments','reports',
    'connection_preferences','connections','direct_messages','connection_blocks','connection_reports'] loop
    execute format('create policy active_account on public.%I as restrictive for all to authenticated using ((select public.is_active_member())) with check ((select public.is_active_member()))',t);
  end loop;
end $$;
create policy active_capture_account on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'captures' or (select public.is_active_member()));
commit;
