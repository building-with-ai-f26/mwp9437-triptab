-- TripTab: plans that span time (Mike's walkthrough, 11/16).
-- An activity can cover several parts of a day and several days as ONE plan with one cost
-- (skiing every day of a stop is one plan, not twelve). A flight has an arrival day and time, so
-- a red-eye runs from Thursday evening into Friday morning.
--
-- end_day, which only stays had (their check-out), now also holds an activity's last day and
-- the day a flight lands. end_part is the last part of the day covered. start_time and end_time
-- are clock times (a flight's departure and arrival), with no time zone: local to where it is.
-- Safe for the app that is already live: it never sends these for anything but a stay.

alter table public.items
  add column end_part public.day_part,
  add column start_time time,
  add column end_time time;
grant insert (end_part, start_time, end_time), update (end_part, start_time, end_time) on public.items to authenticated;

-- Was: only a stay may have an end day.
alter table public.items drop constraint items_check1;
alter table public.items
  add constraint items_end_day_after_start check (kind = 'stay' or end_day is null or end_day >= day),
  -- Within one day a plan can't end in an earlier part than it starts.
  add constraint items_end_part_after_start check (end_part is null or (end_day is not null and end_day > day) or end_part >= part),
  add constraint items_stay_has_no_parts check (kind <> 'stay' or (end_part is null and start_time is null and end_time is null));

-- A plan's days stay inside the trip. A flight home or a late transfer may land the day after
-- the trip's last day, like a check-out.
create or replace function public.check_item_dates() returns trigger
language plpgsql set search_path = '' as $$
declare t record;
begin
  select start_date, end_date into t from public.trips where id = new.trip_id;
  if new.day < t.start_date or new.day > t.end_date then
    raise exception 'Pick a day inside the trip' using errcode = '23514';
  end if;
  if new.kind = 'stay' and new.end_day > t.end_date + 1 then
    raise exception 'Check-out can''t be more than a day after the trip ends' using errcode = '23514';
  end if;
  if new.kind in ('flight', 'transport') and new.end_day > t.end_date + 1 then
    raise exception 'It can''t arrive more than a day after the trip ends' using errcode = '23514';
  end if;
  if new.kind in ('activity', 'meal') and new.end_day > t.end_date then
    raise exception 'Pick a last day inside the trip' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.check_item_dates() from public, anon, authenticated;

-- Changing a trip's dates is refused while any plan would fall outside them, to its last day.
create or replace function public.update_trip(p_trip uuid, p_name text, p_stops jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_start date;
  v_end date;
  v_outside int;
  s jsonb;
  i int := 0;
begin
  if not private.is_trip_owner(p_trip) then raise exception 'Only owners can do that' using errcode = '42501'; end if;
  if jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then
    raise exception 'Add at least one stop with dates' using errcode = '22023';
  end if;
  if jsonb_array_length(p_stops) > 20 then raise exception 'Up to 20 stops' using errcode = '22023'; end if;
  select min((e->>'start_date')::date), max((e->>'end_date')::date) into v_start, v_end
  from jsonb_array_elements(p_stops) e;

  select count(*) into v_outside from public.items
   where trip_id = p_trip
     and (day < v_start or day > v_end
          or (kind in ('stay', 'flight', 'transport') and end_day > v_end + 1)
          or (kind in ('activity', 'meal') and end_day > v_end));
  if v_outside > 0 then
    raise exception 'Some plans fall outside the new dates; move or remove them first' using errcode = '23514';
  end if;

  update public.trips set name = btrim(p_name), start_date = v_start, end_date = v_end where id = p_trip;
  delete from public.stops where trip_id = p_trip;
  for s in select * from jsonb_array_elements(p_stops) loop
    insert into public.stops (trip_id, name, start_date, end_date, position)
    values (p_trip, btrim(s->>'name'), (s->>'start_date')::date, (s->>'end_date')::date, i);
    i := i + 1;
  end loop;
end $$;
revoke execute on function public.update_trip(uuid, text, jsonb) from public, anon;
grant execute on function public.update_trip(uuid, text, jsonb) to authenticated;
