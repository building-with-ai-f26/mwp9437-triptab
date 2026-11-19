-- TripTab: extend a trip in one tap (Mike's call, 11/16). Travel often spills a day either side
-- of a trip (a flight the night before, a late transfer home), so when a plan falls just outside
-- the dates an Owner can stretch the trip to include that day without opening trip settings.
--
-- Only ever widens the trip, by up to a week at either end: the first stop starts earlier or the
-- last stop ends later, and the trip's dates follow. Nothing is moved or removed, and the 60-day
-- cap on trips still holds (the trips table's check). Additive: the live app doesn't call it.

create or replace function public.extend_trip(p_trip uuid, p_day date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_start date;
  v_end date;
begin
  if not private.is_trip_owner(p_trip) then raise exception 'Only owners can do that' using errcode = '42501'; end if;
  if p_day is null then raise exception 'Pick a day' using errcode = '22023'; end if;
  select start_date, end_date into v_start, v_end from public.trips where id = p_trip for update;
  if p_day between v_start and v_end then return; end if;
  if p_day < v_start - 7 or p_day > v_end + 7 then
    raise exception 'That day is more than a week outside the trip; change the dates in trip settings' using errcode = '22023';
  end if;
  if (greatest(v_end, p_day) - least(v_start, p_day)) > 60 then
    raise exception 'Trips can be up to 60 days' using errcode = '23514';
  end if;

  if p_day < v_start then
    update public.stops set start_date = p_day
     where id = (select id from public.stops where trip_id = p_trip order by start_date, position limit 1);
    update public.trips set start_date = p_day where id = p_trip;
  else
    update public.stops set end_date = p_day
     where id = (select id from public.stops where trip_id = p_trip order by end_date desc, position desc limit 1);
    update public.trips set end_date = p_day where id = p_trip;
  end if;
end $$;
revoke execute on function public.extend_trip(uuid, date) from public, anon;
grant execute on function public.extend_trip(uuid, date) to authenticated;
