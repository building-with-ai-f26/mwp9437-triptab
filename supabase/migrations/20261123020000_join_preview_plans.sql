-- The invite shows the trip before asking anyone to sign up (C45, Mike's call 11/23): who invited
-- you, the next plans and how many there are, alongside the name, dates, stops and names it
-- already showed. At the 11/17 pod test 5 people opened the join page and 2 claimed a name.
--
-- What a link holder can now read without an account, and nothing more: the first name on the
-- trip's Owner list as "invited by", and for up to 3 plans their title, kind, day, part of the
-- day, start time and status. Never a cost, a place, a link, notes, or anyone's contact or pay
-- details. The link already lets its holder join the trip and read all of it, so this shows a
-- little of what joining shows. A link that's off or renewed still returns nothing.
create or replace function public.join_preview(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  l record;
  v jsonb;
begin
  select * into l from public.trip_links where token = p_token and enabled;
  if not found then return null; end if;
  select jsonb_build_object(
    'trip_id', t.id,
    'name', t.name,
    'start_date', t.start_date,
    'end_date', t.end_date,
    'default_role', l.default_role,
    'stops', coalesce((select jsonb_agg(s.name order by s.position) from public.stops s where s.trip_id = t.id), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', tr.id, 'name', tr.name, 'claimed', tr.user_id is not null) order by tr.created_at)
      from public.travelers tr where tr.trip_id = t.id
    ), '[]'::jsonb),
    'my_traveler_id', (select tr.id from public.travelers tr where tr.trip_id = t.id and tr.user_id = auth.uid()),
    -- Who started the trip, or failing that its first Owner.
    'invited_by', (
      select tr.name from public.travelers tr
       where tr.trip_id = t.id and tr.role = 'owner' and tr.user_id is not null
       order by (tr.user_id = t.created_by) desc, tr.created_at
       limit 1
    ),
    'plan_count', (select count(*) from public.items i where i.trip_id = t.id),
    -- The next 3: what's still ahead first, in the order the itinerary shows it.
    'plans', coalesce((
      select jsonb_agg(p.plan order by p.n)
      from (
        select jsonb_build_object(
                 'title', i.title, 'kind', i.kind, 'day', i.day, 'part', i.part,
                 'start_time', to_char(i.start_time, 'HH24:MI'), 'status', i.status
               ) as plan,
               row_number() over (
                 order by (coalesce(i.end_day, i.day) < current_date), i.day,
                          array_position(array['morning','day','evening','night'], i.part::text),
                          i.start_time nulls last, i.created_at
               ) as n
          from public.items i
         where i.trip_id = t.id
      ) p
      where p.n <= 3
    ), '[]'::jsonb)
  ) into v
  from public.trips t where t.id = l.trip_id;
  return v;
end $$;

revoke execute on function public.join_preview(text) from public;
grant execute on function public.join_preview(text) to anon, authenticated;
