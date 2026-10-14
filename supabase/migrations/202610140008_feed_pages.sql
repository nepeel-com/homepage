begin;

-- Continue after the last fetched photo, rather than a position that changes after deletion.
-- Uses the existing posts_feed_idx(created_at desc, id desc).
create function public.get_feed_page(
  p_mode text default 'all', p_search text default '',
  p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_post uuid default null
)
returns table(id uuid, user_id uuid, caption text, image_path text, created_at timestamptz, captured_at timestamptz, platform text,
  username text, display_name text, like_count bigint, comment_count bigint, liked boolean, saved boolean, following boolean)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if (p_cursor_at is null) <> (p_cursor_id is null) then
    raise exception 'INVALID_FEED_CURSOR' using errcode='22023';
  end if;
  return query
  select p.id, p.user_id, p.caption, p.image_path, p.created_at, p.captured_at, p.platform, u.username, u.display_name,
    (select count(*) from public.likes l where l.post_id=p.id),
    (select count(*) from public.comments c where c.post_id=p.id),
    exists(select 1 from public.likes l where l.post_id=p.id and l.user_id=auth.uid()),
    exists(select 1 from public.bookmarks b where b.post_id=p.id and b.user_id=auth.uid()),
    exists(select 1 from public.follows f where f.following_id=p.user_id and f.follower_id=auth.uid())
  from public.posts p join public.profiles u on u.id=p.user_id
  where auth.uid() is not null
    and (p_post is null or p.id=p_post)
    and (p_cursor_at is null or (p.created_at,p.id)<(p_cursor_at,p_cursor_id))
    and (p_mode='all'
      or (p_mode='profile' and p.user_id=auth.uid())
      or (p_mode='saved' and exists(select 1 from public.bookmarks b where b.post_id=p.id and b.user_id=auth.uid()))
      or (p_mode='following' and exists(select 1 from public.follows f where f.following_id=p.user_id and f.follower_id=auth.uid())))
    and (p_search='' or p.caption ilike '%' || left(p_search,80) || '%' or u.display_name ilike '%' || left(p_search,80) || '%')
  order by p.created_at desc,p.id desc limit 21;
end; $$;
revoke all on function public.get_feed_page from public, anon;
grant execute on function public.get_feed_page to authenticated;

commit;
