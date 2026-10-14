begin;
alter table public.posts add column photo_filter text not null default 'original'
  check(photo_filter in ('original','warm','cool','mono','film'));
alter table public.posts add column reference_post_id uuid references public.posts(id) on delete set null;
alter table public.capture_publications add column context jsonb;

create table public.photo_places (
  post_id uuid primary key references public.posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  latitude numeric(6,3) not null check(latitude between -90 and 90),
  longitude numeric(7,3) not null check(longitude between -180 and 180),
  label text not null check(char_length(trim(label)) between 1 and 80),
  audience text not null check(audience in ('private','followers','members'))
);
create index photo_places_author_lat_idx on public.photo_places(user_id,latitude);
alter table public.photo_places enable row level security;
revoke all on public.photo_places from public,anon,authenticated;
grant all on public.photo_places to service_role;
grant select on public.photo_places to authenticated;

create function public.can_read_photo_place(p_post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.photo_places l where l.post_id=p_post
    and public.is_active_member() and (l.user_id=auth.uid() or (
      (l.audience='members' or (l.audience='followers' and exists(
        select 1 from public.follows f where f.follower_id=auth.uid() and f.following_id=l.user_id)))
      and not exists(select 1 from public.connection_blocks b
        where (b.user_id=auth.uid() and b.blocked_id=l.user_id) or (b.user_id=l.user_id and b.blocked_id=auth.uid())))));
$$;
create policy shared_photo_places on public.photo_places for select to authenticated
  using(public.can_read_photo_place(post_id));

drop function public.reserve_capture_publication(uuid,uuid,text,text,text,text,bigint,bigint);
create function public.reserve_capture_publication(
  p_id uuid, p_user uuid, p_hash text, p_caption text, p_platform text,
  p_key text default null, p_previous bigint default null, p_next bigint default null, p_context jsonb default null
) returns setof public.capture_publications
language plpgsql security definer set search_path = '' as $$
declare c public.capture_challenges; r public.capture_publications;
begin
  select * into c from public.capture_challenges where id=p_id and user_id=p_user for update;
  if not found then raise exception 'Capture unavailable'; end if;
  select * into r from public.capture_publications where challenge_id=p_id;
  if found then
    if r.user_id is distinct from p_user or r.image_sha256 is distinct from p_hash
      or r.caption is distinct from p_caption or r.platform is distinct from p_platform
      or r.context is distinct from p_context then raise exception 'Capture content changed'; end if;
    return next r; return;
  end if;
  perform public.claim_capture(p_id,p_user,p_key,p_previous,p_next);
  return query insert into public.capture_publications(challenge_id,user_id,image_sha256,caption,platform,captured_at,context)
    values(p_id,p_user,p_hash,p_caption,p_platform,c.created_at,p_context) returning *;
end; $$;

create or replace function public.finish_capture_publication(p_id uuid,p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.capture_publications; l jsonb; ref uuid;
begin
  select * into r from public.capture_publications where challenge_id=p_id and user_id=p_user for update;
  if not found then raise exception 'Capture unavailable'; end if;
  if r.state='published' then return r.post_id; end if;
  if r.state<>'pending' or r.expires_at<=now() then raise exception 'Capture unavailable'; end if;
  ref := (r.context->>'referencePostId')::uuid;
  -- A removed source never prevents publishing the member's own new photograph.
  select id into ref from public.posts where id=ref;
  insert into public.posts(id,user_id,image_path,image_sha256,caption,platform,captured_at,photo_filter,reference_post_id)
    values(r.post_id,r.user_id,r.image_path,r.image_sha256,r.caption,r.platform,r.captured_at,
      coalesce(r.context->>'filter','original'),ref);
  l := r.context->'place';
  if l is not null and l<>'null'::jsonb then
    insert into public.photo_places(post_id,user_id,latitude,longitude,label,audience)
      values(r.post_id,r.user_id,(l->>'latitude')::numeric,(l->>'longitude')::numeric,l->>'label',l->>'audience');
  end if;
  update public.capture_publications set state='published' where challenge_id=p_id;
  return r.post_id;
end; $$;

create function public.get_photo_details(p_ids uuid[])
returns table(post_id uuid,photo_filter text,reference_post_id uuid,latitude numeric,longitude numeric,label text,audience text)
language sql stable security invoker set search_path = '' as $$
  select p.id,p.photo_filter,p.reference_post_id,l.latitude,l.longitude,l.label,l.audience
    from public.posts p left join public.photo_places l on l.post_id=p.id
    where p.id=any(p_ids[1:40]);
$$;

create function public.nearby_followed_photos(p_latitude double precision,p_longitude double precision,p_radius integer default 1000)
returns table(post_id uuid,user_id uuid,display_name text,image_path text,created_at timestamptz,
  latitude numeric,longitude numeric,label text,distance_m integer,photo_filter text)
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select p_latitude as lat,p_longitude as lon,least(5000,greatest(100,coalesce(p_radius,1000))) as radius
    where p_latitude between -90 and 90 and p_longitude between -180 and 180
  ), candidates as (
    select p.id,p.user_id,u.display_name,p.image_path,p.created_at,l.latitude,l.longitude,l.label,p.photo_filter,b.radius,
      6371000*2*asin(sqrt(least(1.0,greatest(0.0,
        power(sin(radians(l.latitude::float8-b.lat)/2),2)+cos(radians(b.lat))*cos(radians(l.latitude::float8))
        *power(sin(radians(l.longitude::float8-b.lon)/2),2))))) as distance
    from bounds b join public.follows f on f.follower_id=auth.uid()
      join public.photo_places l on l.user_id=f.following_id
      join public.posts p on p.id=l.post_id join public.profiles u on u.id=p.user_id
    where abs(l.latitude::float8-b.lat)<=b.radius/110000.0
      and least(abs(l.longitude::float8-b.lon),360-abs(l.longitude::float8-b.lon))
        <=least(180,2*b.radius/(110000.0*greatest(.000001,abs(cos(radians(b.lat))))))
  ) select id,user_id,display_name,image_path,created_at,latitude,longitude,label,(round(distance/50)*50)::integer,photo_filter
    from candidates where distance<=radius order by distance,created_at desc,id limit 20;
$$;

create function public.set_photo_place_audience(p_post uuid,p_audience text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_member() or not exists(select 1 from public.posts where id=p_post and user_id=auth.uid()) then
    raise exception 'Photo unavailable';
  end if;
  if p_audience is null then
    delete from public.photo_places where post_id=p_post;
  elsif p_audience in ('private','followers','members') then
    update public.photo_places set audience=p_audience where post_id=p_post;
  else raise exception 'Invalid audience'; end if;
end; $$;
revoke all on function public.reserve_capture_publication from public,anon,authenticated;
grant execute on function public.reserve_capture_publication to service_role;
revoke all on function public.can_read_photo_place,public.get_photo_details,public.nearby_followed_photos,
  public.set_photo_place_audience from public,anon;
grant execute on function public.can_read_photo_place,public.get_photo_details,public.nearby_followed_photos,
  public.set_photo_place_audience to authenticated;
commit;
