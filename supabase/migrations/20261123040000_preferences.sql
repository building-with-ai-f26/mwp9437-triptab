-- A short, optional preferences survey on your profile (C51, Mike's call 11/23): the cuisines and
-- activities you like, with a toggle you set: shared with the group, or private. Private by
-- default.
--
-- Who can see what:
--   - Shared: the people on your trips see your picks beside your name (trip_tastes).
--   - Private: nobody sees them. Plan with AI still counts them, as "3 of the group like Italian",
--     never with a name (trip_taste_counts, which only the server can call).
-- Your own profile reads them back to you either way.
alter table public.profiles
  add column cuisines text[] not null default '{}' constraint profiles_cuisines_size check (cardinality(cuisines) <= 12),
  add column activities text[] not null default '{}' constraint profiles_activities_size check (cardinality(activities) <= 12),
  add column prefs_shared boolean not null default false;

-- Your profile row, made if it's missing from what your trips hold, so saving preferences first
-- never blanks pay details you set before profiles existed.
create function private.ensure_profile(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, venmo, zelle, locked)
  select p_user, t.venmo, t.zelle, true
    from (select 1) one
    left join lateral (
      select tr.venmo, tr.zelle from public.travelers tr
       where tr.user_id = p_user and tr.pay_locked
       order by tr.created_at desc limit 1
    ) t on true
  on conflict (user_id) do nothing;
end $$;
revoke execute on function private.ensure_profile(uuid) from public, anon, authenticated;

-- Picks are short lowercase words from the app's lists; anything else is dropped here.
create function private.clean_picks(p text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct x order by x), '{}')
    from (select lower(btrim(v)) as x from unnest(coalesce(p, '{}'::text[])) v) s
   where x ~ '^[a-z][a-z ]{1,29}$'
$$;
revoke execute on function private.clean_picks(text[]) from public, anon, authenticated;

create function public.save_my_prefs(p_cuisines text[], p_activities text[], p_shared boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform private.ensure_profile(me);
  update public.profiles
     set cuisines = private.clean_picks(p_cuisines),
         activities = private.clean_picks(p_activities),
         prefs_shared = coalesce(p_shared, false),
         updated_at = now()
   where user_id = me;
end $$;
revoke execute on function public.save_my_prefs(text[], text[], boolean) from public, anon;
grant execute on function public.save_my_prefs(text[], text[], boolean) to authenticated;

-- Your profile as the page shows it, now with your picks and whether they're shared.
create or replace function public.my_profile() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('venmo', p.venmo, 'zelle', p.zelle, 'phone', p.phone, 'locked', p.locked, 'saved', true,
                               'cuisines', to_jsonb(p.cuisines), 'activities', to_jsonb(p.activities), 'prefs_shared', p.prefs_shared)
       from public.profiles p where p.user_id = (select auth.uid())),
    (select jsonb_build_object('venmo', t.venmo, 'zelle', t.zelle, 'phone', null, 'locked', true, 'saved', false,
                               'cuisines', '[]'::jsonb, 'activities', '[]'::jsonb, 'prefs_shared', false)
       from public.travelers t
      where t.user_id = (select auth.uid()) and t.pay_locked
      order by t.created_at desc limit 1),
    jsonb_build_object('venmo', null, 'zelle', null, 'phone', null, 'locked', true, 'saved', false,
                       'cuisines', '[]'::jsonb, 'activities', '[]'::jsonb, 'prefs_shared', false)
  )
$$;

-- What the people on a trip chose to share, for the people on that trip only.
create function public.trip_tastes(p_trip uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('traveler_id', t.id, 'cuisines', to_jsonb(p.cuisines), 'activities', to_jsonb(p.activities))), '[]'::jsonb)
    from public.travelers t
    join public.profiles p on p.user_id = t.user_id
   where t.trip_id = p_trip
     and p.prefs_shared
     and (cardinality(p.cuisines) > 0 or cardinality(p.activities) > 0)
     and private.is_trip_member(p_trip)
$$;
revoke execute on function public.trip_tastes(uuid) from public, anon;
grant execute on function public.trip_tastes(uuid) to authenticated;

-- For Plan with AI, on the server only: how many of a trip's people like each thing, shared or
-- private alike, with no names. Counted here, in one statement (AGENTS.md rule 11).
create function public.trip_taste_counts(p_trip uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with mine as (
    select p.cuisines, p.activities
      from public.travelers t join public.profiles p on p.user_id = t.user_id
     where t.trip_id = p_trip and (cardinality(p.cuisines) > 0 or cardinality(p.activities) > 0)
  )
  select jsonb_build_object(
    'people', (select count(*) from public.travelers t where t.trip_id = p_trip),
    'answered', (select count(*) from mine),
    'cuisines', coalesce((select jsonb_object_agg(c, n) from (select c, count(*) as n from mine, unnest(cuisines) c group by c) x), '{}'::jsonb),
    'activities', coalesce((select jsonb_object_agg(a, n) from (select a, count(*) as n from mine, unnest(activities) a group by a) y), '{}'::jsonb)
  )
$$;
revoke execute on function public.trip_taste_counts(uuid) from public, anon, authenticated;
grant execute on function public.trip_taste_counts(uuid) to service_role;
