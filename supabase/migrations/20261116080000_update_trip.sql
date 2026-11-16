-- Owners can change a trip after starting it: its name and its stops (which set its dates),
-- in one step. Refused if any plan or stay would fall outside the new dates, so nothing is
-- silently orphaned; the owner moves or removes those plans first.
create function public.update_trip(p_trip uuid, p_name text, p_stops jsonb)
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
     and (day < v_start or day > v_end or (kind = 'stay' and end_day > v_end + 1));
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
