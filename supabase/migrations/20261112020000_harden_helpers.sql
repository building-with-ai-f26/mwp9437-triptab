-- Hardening after Supabase's security advisor (11/12):
-- 1. The role helpers move to a `private` schema the API doesn't expose, so they can't be
--    called as /rpc endpoints. Policies keep working (they point at the functions, not their names).
-- 2. Trigger functions can't be called through the API.
-- Left as is, on purpose: create_trip, join_trip, reset_group_link and join_preview are the
-- app's entry points and check the caller inside; join_preview is open to visitors who aren't
-- signed in so the group link can show the trip before you make an account.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.my_trip_role(uuid) set schema private;
alter function public.is_trip_member(uuid) set schema private;
alter function public.is_trip_owner(uuid) set schema private;

revoke execute on function public.keep_an_owner() from public, anon, authenticated;
revoke execute on function public.check_item_dates() from public, anon, authenticated;

-- reset_group_link named the helper by its old schema; point it at the new one.
create or replace function public.reset_group_link(p_trip uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not private.is_trip_owner(p_trip) then raise exception 'Only owners can do that' using errcode = '42501'; end if;
  update public.trip_links set token = encode(extensions.gen_random_bytes(18), 'hex')
   where trip_id = p_trip returning token into v_token;
  return v_token;
end $$;
