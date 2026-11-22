-- Security audit, 11/22 (SECURITY.md, journal/security/README.md). Two holes closed and two things
-- tightened. Nothing here deletes or rewrites a row.

-- 1. An expense on another trip (attack 7). save_expense takes a trip and an expense id. The Owner
--    check ran against the trip, but nothing checked that the expense belonged to it: the update
--    matched no row, and the lines after it still deleted that expense's shares and wrote new ones.
--    So a Viewer could make a trip of their own (where they are the Owner) and rewrite the split of
--    any general expense whose id they could read, on a trip where they may only look. Found by
--    reading the function, shown on TripTab dev, and covered by app/src/audit.live.test.ts. Same
--    function, with the expense checked against the trip before anything is written.
create or replace function private.write_expense(
  p_trip uuid, p_expense uuid, p_item uuid, p_description text, p_day date,
  p_total int, p_paid_by uuid, p_mode public.split_mode, p_shares jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_expense;
  v_sum bigint;
  v_bad int;
begin
  if not private.is_trip_owner(p_trip) then raise exception 'Only owners can do that' using errcode = '42501'; end if;
  if v_id is not null and not exists (select 1 from public.expenses where id = v_id and trip_id = p_trip) then
    raise exception 'That expense is gone' using errcode = 'P0002';
  end if;
  if p_total is null or p_total < 0 then raise exception 'Enter the cost' using errcode = '22023'; end if;
  if not exists (select 1 from public.travelers where id = p_paid_by and trip_id = p_trip) then
    raise exception 'Pick who paid from the trip' using errcode = '22023';
  end if;
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'Pick at least one person' using errcode = '22023';
  end if;
  select count(*) into v_bad from jsonb_array_elements(p_shares) s
   where not exists (select 1 from public.travelers t where t.id = (s->>'traveler_id')::uuid and t.trip_id = p_trip)
      or (s->>'amount_cents')::int < 0;
  if v_bad > 0 then raise exception 'Everyone in the split has to be on the trip' using errcode = '22023'; end if;
  select coalesce(sum((s->>'amount_cents')::int), 0) into v_sum from jsonb_array_elements(p_shares) s;
  if v_sum <> p_total then raise exception 'The split has to add up to the cost' using errcode = '22023'; end if;

  if v_id is null then
    insert into public.expenses (trip_id, item_id, description, day, total_cents, paid_by, split_mode, created_by)
    values (p_trip, p_item, btrim(p_description), p_day, p_total, p_paid_by, p_mode, auth.uid())
    returning id into v_id;
  else
    update public.expenses
       set description = btrim(p_description), day = p_day, total_cents = p_total, paid_by = p_paid_by, split_mode = p_mode
     where id = v_id and trip_id = p_trip;
    delete from public.expense_shares where expense_id = v_id;
  end if;

  insert into public.expense_shares (expense_id, traveler_id, amount_cents, weight)
  select v_id, (s->>'traveler_id')::uuid, (s->>'amount_cents')::int, nullif(s->>'weight', '')::numeric
  from jsonb_array_elements(p_shares) s;
  return v_id;
end $$;
revoke execute on function private.write_expense(uuid, uuid, uuid, text, date, int, uuid, public.split_mode, jsonb) from public, anon, authenticated;

-- 2. The AI caps stopped counting at 1,000 rows (attack 8). The four AI functions fetched today's
--    ai_calls rows and added them up themselves, and the database's API hands back 1,000 rows at
--    most. A refused call writes a row too, so one account could fill the day with refusals, and
--    after that nobody's calls or dollars were counted until midnight. The sum now happens here,
--    in the database, where there is no ceiling. Only the functions' service role may call it.
create function public.ai_spend_today(p_since timestamptz, p_user uuid)
returns table (spent numeric, mine integer) language sql stable set search_path = '' as $$
  select coalesce(sum(c.cost_usd), 0)::numeric,
         (count(*) filter (
            where c.user_id = p_user
              -- calls that reached the Claude API; a refusal for being over a cap doesn't count
              and c.result in ('ok', 'no_plans', 'refused', 'invalid_output', 'timeout', 'error')
         ))::integer
    from public.ai_calls c
   where c.created_at >= p_since
$$;
revoke execute on function public.ai_spend_today(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.ai_spend_today(timestamptz, uuid) to service_role;

-- 3. Who suggested a plan can't be forged. An Owner could add a plan or a to-do with created_by set
--    to someone else's account, so "suggested by" would name them. A signed-in insert now always
--    carries the caller. (The functions' service role is left alone; it has no caller.)
create function private.stamp_created_by() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null then new.created_by := (select auth.uid()); end if;
  return new;
end $$;
revoke execute on function private.stamp_created_by() from public, anon, authenticated;
create trigger items_stamp_created_by before insert on public.items
for each row execute function private.stamp_created_by();
create trigger action_items_stamp_created_by before insert on public.action_items
for each row execute function private.stamp_created_by();

-- 4. Rights nobody uses. Supabase hands new tables every right by default, and earlier migrations
--    took back the ones that mattered. Emptying a table whole, pointing foreign keys at it and
--    adding triggers were still granted to signed-in people on nine tables. The API offers no way
--    to use them, and row-level security doesn't cover emptying a table, so they go.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
