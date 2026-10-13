-- Run once with the Supabase SQL editor, or `supabase db push`.
begin;
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,40}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 160),
  created_at timestamptz not null default now()
);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, username, display_name)
  values (new.id, 'n_' || replace(new.id::text, '-', ''),
    coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),40),''), '새로운 이웃'));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Also handles accounts created before this migration.
insert into public.profiles(id, username, display_name)
select id, 'n_' || replace(id::text, '-', ''), coalesce(nullif(left(trim(raw_user_meta_data->>'display_name'),40),''), '새로운 이웃') from auth.users on conflict do nothing;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  image_path text unique not null,
  image_sha256 text not null check (image_sha256 ~ '^[a-f0-9]{64}$'),
  caption text not null default '' check (char_length(caption) <= 1000),
  platform text not null check (platform in ('ios','android')),
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index posts_feed_idx on public.posts(created_at desc, id desc);
create index posts_author_idx on public.posts(user_id, created_at desc);
create table public.likes (
  user_id uuid references public.profiles on delete cascade,
  post_id uuid references public.posts on delete cascade,
  primary key(user_id, post_id)
);
create index likes_post_idx on public.likes(post_id);
create table public.bookmarks (
  user_id uuid references public.profiles on delete cascade,
  post_id uuid references public.posts on delete cascade,
  primary key(user_id, post_id)
);
create table public.follows (
  follower_id uuid references public.profiles on delete cascade,
  following_id uuid references public.profiles on delete cascade,
  primary key(follower_id, following_id), check (follower_id <> following_id)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  post_id uuid not null references public.posts on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments(post_id, created_at);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  post_id uuid not null references public.posts on delete cascade,
  reason text not null check (reason in ('synthetic','harmful','spam','other')),
  created_at timestamptz not null default now(), unique(user_id,post_id)
);
-- These tables have no client policies and are inaccessible to user tokens.
create table public.capture_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  nonce text not null, purpose text not null check (purpose in ('capture','register')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 minutes',
  used_at timestamptz
);
create index challenges_user_idx on public.capture_challenges(user_id, created_at);
create table public.device_keys (
  key_id text primary key, user_id uuid not null references public.profiles on delete cascade,
  public_key text not null, sign_count bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.follows enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.capture_challenges enable row level security;
alter table public.device_keys enable row level security;
revoke all on public.profiles, public.posts, public.likes, public.bookmarks, public.follows, public.comments, public.reports, public.capture_challenges, public.device_keys from anon, authenticated;
grant select on public.profiles, public.posts, public.likes, public.follows, public.comments to authenticated;
grant update(display_name, bio) on public.profiles to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
grant insert, delete on public.likes, public.follows, public.comments to authenticated;
grant insert on public.reports to authenticated;
grant all on public.profiles, public.posts, public.likes, public.bookmarks, public.follows, public.comments, public.reports, public.capture_challenges, public.device_keys to service_role;

create policy member_profiles on public.profiles for select to authenticated using (true);
create policy own_profile on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy member_posts on public.posts for select to authenticated using (true);
-- Intentionally NO INSERT / UPDATE / DELETE policy on posts. Server only.
create policy member_likes on public.likes for select to authenticated using (true);
create policy own_like_insert on public.likes for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_like_delete on public.likes for delete to authenticated using (user_id = (select auth.uid()));
create policy own_bookmarks on public.bookmarks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy member_follows on public.follows for select to authenticated using (true);
create policy own_follow_insert on public.follows for insert to authenticated with check (follower_id = (select auth.uid()));
create policy own_follow_delete on public.follows for delete to authenticated using (follower_id = (select auth.uid()));
create policy member_comments on public.comments for select to authenticated using (true);
create policy own_comment_insert on public.comments for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_comment_delete on public.comments for delete to authenticated using (user_id = (select auth.uid()));
create policy own_report on public.reports for insert to authenticated with check (user_id = (select auth.uid()));

create function public.get_feed(p_mode text default 'all', p_search text default '', p_offset integer default 0, p_post uuid default null)
returns table(id uuid, user_id uuid, caption text, image_path text, created_at timestamptz, captured_at timestamptz, platform text,
  username text, display_name text, like_count bigint, comment_count bigint, liked boolean, saved boolean, following boolean)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.user_id, p.caption, p.image_path, p.created_at, p.captured_at, p.platform, u.username, u.display_name,
    (select count(*) from public.likes l where l.post_id = p.id),
    (select count(*) from public.comments c where c.post_id = p.id),
    exists(select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists(select 1 from public.bookmarks b where b.post_id = p.id and b.user_id = auth.uid()),
    exists(select 1 from public.follows f where f.following_id = p.user_id and f.follower_id = auth.uid())
  from public.posts p join public.profiles u on u.id = p.user_id
  where auth.uid() is not null
    and (p_post is null or p.id = p_post)
    and (p_mode = 'all'
      or (p_mode = 'profile' and p.user_id = auth.uid())
      or (p_mode = 'saved' and exists(select 1 from public.bookmarks b where b.post_id=p.id and b.user_id=auth.uid()))
      or (p_mode = 'following' and exists(select 1 from public.follows f where f.following_id=p.user_id and f.follower_id=auth.uid())))
    and (p_search = '' or p.caption ilike '%' || left(p_search,80) || '%' or u.display_name ilike '%' || left(p_search,80) || '%')
  order by p.created_at desc, p.id desc limit 20 offset greatest(0,least(p_offset,10000));
$$;
revoke all on function public.get_feed from public, anon;
grant execute on function public.get_feed to authenticated;

create function public.issue_challenge(p_user uuid, p_nonce text, p_purpose text)
returns setof public.capture_challenges language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  delete from public.capture_challenges where user_id=p_user and created_at < now()-interval '1 day';
  if (select count(*) from public.capture_challenges where user_id=p_user and created_at > now()-interval '10 minutes') >= 12 then
    raise exception 'Too many capture requests' using errcode='P0001';
  end if;
  return query insert into public.capture_challenges(user_id,nonce,purpose) values(p_user,p_nonce,p_purpose) returning *;
end; $$;

create function public.claim_capture(p_id uuid, p_user uuid, p_key text default null, p_previous bigint default null, p_next bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.capture_challenges set used_at=now()
    where id=p_id and user_id=p_user and purpose='capture' and used_at is null and expires_at>now();
  if not found then raise exception 'Capture expired or already used'; end if;
  if p_key is not null then
    update public.device_keys set sign_count=p_next where key_id=p_key and user_id=p_user and sign_count=p_previous and p_next>sign_count;
    if not found then raise exception 'Invalid assertion counter'; end if;
  end if;
end; $$;

create function public.register_device(p_id uuid, p_user uuid, p_key text, p_public_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.capture_challenges set used_at=now() where id=p_id and user_id=p_user and purpose='register' and used_at is null and expires_at>now();
  if not found then raise exception 'Registration expired or already used'; end if;
  insert into public.device_keys(key_id,user_id,public_key) values(p_key,p_user,p_public_key);
end; $$;
revoke all on function public.issue_challenge, public.claim_capture, public.register_device, public.handle_new_user from public, anon, authenticated;
grant execute on function public.issue_challenge, public.claim_capture, public.register_device to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('captures','captures',false,2097152,array['image/jpeg']) on conflict(id) do update set public=false, file_size_limit=2097152, allowed_mime_types=array['image/jpeg'];
create policy member_capture_read on storage.objects for select to authenticated
using (bucket_id='captures' and exists(select 1 from public.posts p where p.image_path=name));
-- No client storage INSERT/UPDATE: gallery uploads and direct REST uploads are rejected.
commit;
