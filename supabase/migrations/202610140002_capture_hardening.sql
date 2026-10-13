begin;
alter table public.device_keys add column environment text not null default 'production' check (environment in ('development','production'));
alter table public.capture_challenges add column attempts integer not null default 0;

create function public.begin_capture_attempt(p_id uuid, p_user uuid, p_purpose text)
returns setof public.capture_challenges language plpgsql security definer set search_path = '' as $$
begin
  return query update public.capture_challenges set attempts=attempts+1
    where id=p_id and user_id=p_user and purpose=p_purpose and used_at is null and expires_at>now() and attempts<3 returning *;
  if not found then raise exception 'Capture expired, used, or too many attempts'; end if;
end; $$;

-- Replace registration with an environment-bound key record.
drop function public.register_device(uuid,uuid,text,text);
create function public.register_device(p_id uuid, p_user uuid, p_key text, p_public_key text, p_environment text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.capture_challenges set used_at=now() where id=p_id and user_id=p_user and purpose='register' and used_at is null and expires_at>now();
  if not found then raise exception 'Registration expired or already used'; end if;
  insert into public.device_keys(key_id,user_id,public_key,environment) values(p_key,p_user,p_public_key,p_environment);
end; $$;
revoke all on function public.begin_capture_attempt, public.register_device from public, anon, authenticated;
grant execute on function public.begin_capture_attempt, public.register_device to service_role;
commit;
