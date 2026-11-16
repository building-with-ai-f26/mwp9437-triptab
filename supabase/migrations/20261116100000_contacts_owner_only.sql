-- Contact details (email, phone) are for owners only: they send the invites. Everyone on a trip
-- still sees who's on it (names, roles, who's joined), but only owners can read what an owner
-- typed in for someone, through trip_contacts(), which returns nothing to anyone else.
revoke select on public.travelers from authenticated;
grant select (id, trip_id, name, role, user_id, claimed_at, added_by, created_at) on public.travelers to authenticated;

create function public.trip_contacts(p_trip uuid)
returns table (traveler_id uuid, email text, phone text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.email, t.phone from public.travelers t
  where t.trip_id = p_trip and private.is_trip_owner(p_trip)
$$;
revoke execute on function public.trip_contacts(uuid) from public, anon;
grant execute on function public.trip_contacts(uuid) to authenticated;
