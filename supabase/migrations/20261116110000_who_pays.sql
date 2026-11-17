-- TripTab: who pays (Mike's call, 11/16). Every plan is either one bill that gets split (as
-- before) or "everyone pays their own": each person going logs their own line, with their own
-- price and a booked mark.
--
-- An own line is an expense whose payer is its only share, so it never moves a balance and the
-- settle-up math is untouched. A plan in this mode holds one line per person instead of one cost
-- per plan. Everyone on the trip sees who has booked (own_marks); each price is readable only by
-- that person and by whoever entered it (row-level security below). The plan's status follows
-- the lines: Confirmed once everyone going has logged theirs.
--
-- Safe for the app that is already live: plans it adds get a default by kind, and confirming a
-- plan from it still works (a plan with no own lines switches to one bill on confirm).

create type public.pay_mode as enum ('split', 'own');

-- ---------- Plans: one bill, or everyone pays their own ----------
alter table public.items add column pay_mode public.pay_mode;
-- Existing flights with nothing logged become "their own"; everything else stays one bill.
update public.items i
   set pay_mode = (case when i.kind = 'flight' and not exists (select 1 from public.expenses e where e.item_id = i.id)
                        then 'own' else 'split' end)::public.pay_mode;

-- Default by kind when the app doesn't say: flights are their own, the rest are one bill.
create function public.items_default_pay_mode() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.pay_mode is null then
    new.pay_mode := (case when new.kind = 'flight' then 'own' else 'split' end)::public.pay_mode;
  end if;
  return new;
end $$;
create trigger items_default_pay_mode before insert on public.items
for each row execute function public.items_default_pay_mode();
alter table public.items alter column pay_mode set not null;
grant insert (pay_mode), update (pay_mode) on public.items to authenticated;

-- ---------- Own lines live with the other expenses ----------
alter table public.expenses
  add column own boolean not null default false,
  add column with_points boolean not null default false;
alter table public.expenses
  add constraint expenses_own_has_item check (not own or item_id is not null),
  add constraint expenses_points_only_own check (own or not with_points);
-- One bill per plan, or one own line per person per plan.
alter table public.expenses drop constraint expenses_item_id_key;
create unique index expenses_one_bill_per_item on public.expenses (item_id) where not own;
create unique index expenses_one_own_line_per_person on public.expenses (item_id, paid_by) where own;

-- ---------- Who can read a price ----------
create function private.is_my_traveler(p_traveler uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.travelers where id = p_traveler and user_id = (select auth.uid()))
$$;
revoke execute on function private.is_my_traveler(uuid) from public, anon;
grant execute on function private.is_my_traveler(uuid) to authenticated;

drop policy "members read expenses" on public.expenses;
create policy "members read the tab; an own line only its person or whoever entered it"
  on public.expenses for select to authenticated
  using (
    private.is_trip_member(trip_id)
    and (not own or created_by = (select auth.uid()) or private.is_my_traveler(paid_by))
  );

drop policy "members read shares" on public.expense_shares;
create policy "read the shares of expenses you can read" on public.expense_shares for select to authenticated
  using (exists (
    select 1 from public.expenses e
     where e.id = expense_id
       and private.is_trip_member(e.trip_id)
       and (not e.own or e.created_by = (select auth.uid()) or private.is_my_traveler(e.paid_by))
  ));

-- Who has booked, without the prices: everyone on the trip can read this.
create function public.own_marks(p_trip uuid) returns table (item_id uuid, traveler_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.item_id, e.paid_by
    from public.expenses e
   where e.trip_id = p_trip and e.own and private.is_trip_member(p_trip)
$$;
revoke execute on function public.own_marks(uuid) from public, anon;
grant execute on function public.own_marks(uuid) to authenticated;

-- ---------- Status follows the lines ----------
-- How many people are going to a plan, and how many of them have logged their own line.
-- Going is the same rule as the app: an explicit choice wins; otherwise in, except flights.
create function private.own_counts(p_item uuid, out going int, out booked int)
language sql stable security definer set search_path = '' as $$
  select count(*) filter (where g.is_going)::int,
         count(*) filter (where g.is_going and g.has_line)::int
    from (
      select coalesce(ip.going, i.kind <> 'flight') as is_going,
             exists (select 1 from public.expenses e where e.item_id = i.id and e.own and e.paid_by = t.id) as has_line
        from public.items i
        join public.travelers t on t.trip_id = i.trip_id
        left join public.item_people ip on ip.item_id = i.id and ip.traveler_id = t.id
       where i.id = p_item
    ) g
$$;

-- Sets an own-pay plan's status from its lines: Confirmed when everyone going has booked,
-- otherwise Planned once anything is logged (a suggestion with a booking is at least planned).
create function private.sync_own_status(p_item uuid) returns public.item_status
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.item_status;
  v_mode public.pay_mode;
  v_going int;
  v_booked int;
  v_lines int;
  v_new public.item_status;
begin
  select status, pay_mode into v_status, v_mode from public.items where id = p_item;
  if not found then return null; end if;
  if v_mode <> 'own' then return v_status; end if;
  select c.going, c.booked into v_going, v_booked from private.own_counts(p_item) c;
  select count(*) into v_lines from public.expenses where item_id = p_item and own;
  v_new := case
    when v_going > 0 and v_booked = v_going then 'confirmed'
    when v_status = 'confirmed' then 'planned'
    when v_lines > 0 then 'planned'
    else v_status
  end;
  -- updated_at is touched either way, so everyone's screen picks up a new booked mark.
  update public.items set status = v_new, updated_at = now() where id = p_item;
  return v_new;
end $$;
revoke execute on function private.own_counts(uuid) from public, anon, authenticated;
revoke execute on function private.sync_own_status(uuid) from public, anon, authenticated;

-- Confirmed means paid, in both modes. One bill: a plan becomes Confirmed only with its expense
-- (confirm_item) and leaves it only through unconfirm_item. Their own: Confirmed exactly when
-- everyone going has logged a line. Runs as the table owner so it counts every line, including
-- the ones the caller can't read.
create or replace function public.guard_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_going int;
  v_booked int;
begin
  if new.pay_mode = 'own' then
    select c.going, c.booked into v_going, v_booked from private.own_counts(new.id) c;
    if new.status = 'confirmed' and not (coalesce(v_going, 0) > 0 and v_booked = v_going) then
      raise exception 'It''s confirmed once everyone going has logged their own cost' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.status = 'confirmed' and new.status <> 'confirmed'
       and coalesce(v_going, 0) > 0 and v_booked = v_going then
      raise exception 'Everyone going has booked, so it stays confirmed until a line is cleared' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed')
     and not exists (select 1 from public.expenses where item_id = new.id) then
    raise exception 'Confirm a plan with its cost, who paid and who''s in' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' and new.status <> 'confirmed'
     and exists (select 1 from public.expenses where item_id = new.id) then
    raise exception 'Undo the confirmation to change its status' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.guard_confirmed() from public, anon, authenticated;

-- Switching who pays is one tap while nothing is logged against the plan.
create function public.guard_pay_mode() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pay_mode is distinct from old.pay_mode
     and exists (select 1 from public.expenses where item_id = new.id) then
    raise exception 'Clear what''s logged on this plan before switching who pays' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger items_guard_pay_mode before update of pay_mode on public.items
for each row execute function public.guard_pay_mode();
revoke execute on function public.guard_pay_mode() from public, anon, authenticated;

-- ---------- Log, edit or clear an own line ----------
-- Anyone on the trip, viewers included, logs their own; owners can log anyone's. A line someone
-- logged for themselves can only be changed by them. Whoever writes the price is recorded as the
-- one who entered it (created_by), which is what lets them read it back.
create function public.log_own_line(p_item uuid, p_traveler uuid, p_cents int, p_with_points boolean default false)
returns public.item_status language plpgsql security definer set search_path = '' as $$
declare
  i record;
  v_user uuid;
  v_self boolean;
  v_line uuid;
  v_entered_by uuid;
begin
  select * into i from public.items where id = p_item;
  if not found or not private.is_trip_member(i.trip_id) then
    raise exception 'That plan is gone' using errcode = 'P0002';
  end if;
  select user_id into v_user from public.travelers where id = p_traveler and trip_id = i.trip_id;
  if not found then raise exception 'Pick someone on the trip' using errcode = '22023'; end if;
  v_self := v_user is not null and v_user = auth.uid();
  if not (v_self or private.is_trip_owner(i.trip_id)) then
    raise exception 'You can log your own cost; owners can log anyone''s' using errcode = '42501';
  end if;
  if i.pay_mode <> 'own' then
    raise exception 'This plan is one bill, split. Switch it to everyone pays their own first' using errcode = '22023';
  end if;
  if p_cents is null or p_cents < 0 or p_cents > 100000000 then
    raise exception 'Enter the cost' using errcode = '22023';
  end if;

  select id, created_by into v_line, v_entered_by
    from public.expenses where item_id = p_item and own and paid_by = p_traveler;
  if found then
    if not v_self and v_entered_by is distinct from auth.uid() then
      raise exception 'They logged this one themselves, so only they can change it' using errcode = '42501';
    end if;
    update public.expenses
       set total_cents = p_cents, with_points = coalesce(p_with_points, false), created_by = auth.uid(),
           description = i.title, day = i.day
     where id = v_line;
    delete from public.expense_shares where expense_id = v_line;
  else
    insert into public.expenses (trip_id, item_id, description, day, total_cents, paid_by, split_mode, own, with_points, created_by)
    values (i.trip_id, p_item, i.title, i.day, p_cents, p_traveler, 'even', true, coalesce(p_with_points, false), auth.uid())
    returning id into v_line;
  end if;
  insert into public.expense_shares (expense_id, traveler_id, amount_cents) values (v_line, p_traveler, p_cents);

  -- Logging your cost means you're going.
  insert into public.item_people (item_id, traveler_id, going) values (p_item, p_traveler, true)
  on conflict (item_id, traveler_id) do update set going = true;
  return private.sync_own_status(p_item);
end $$;

create function public.clear_own_line(p_item uuid, p_traveler uuid)
returns public.item_status language plpgsql security definer set search_path = '' as $$
declare
  i record;
  v_user uuid;
  v_self boolean;
  v_line uuid;
  v_entered_by uuid;
begin
  select * into i from public.items where id = p_item;
  if not found or not private.is_trip_member(i.trip_id) then
    raise exception 'That plan is gone' using errcode = 'P0002';
  end if;
  select user_id into v_user from public.travelers where id = p_traveler and trip_id = i.trip_id;
  if not found then raise exception 'Pick someone on the trip' using errcode = '22023'; end if;
  v_self := v_user is not null and v_user = auth.uid();
  select id, created_by into v_line, v_entered_by
    from public.expenses where item_id = p_item and own and paid_by = p_traveler;
  if not found then raise exception 'Nothing is logged for them on this plan' using errcode = 'P0002'; end if;
  if not (v_self or (private.is_trip_owner(i.trip_id) and v_entered_by is not distinct from auth.uid())) then
    raise exception 'They logged this one themselves, so only they can change it' using errcode = '42501';
  end if;
  delete from public.expenses where id = v_line;
  return private.sync_own_status(p_item);
end $$;

revoke execute on function public.log_own_line(uuid, uuid, int, boolean) from public, anon;
revoke execute on function public.clear_own_line(uuid, uuid) from public, anon;
grant execute on function public.log_own_line(uuid, uuid, int, boolean) to authenticated;
grant execute on function public.clear_own_line(uuid, uuid) to authenticated;

-- Opting in or out, and people joining or leaving the trip, change who's counted.
create function public.sync_own_after_going() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.sync_own_status(old.item_id);
  else
    perform private.sync_own_status(new.item_id);
  end if;
  return null;
end $$;
create trigger item_people_sync_own after insert or update or delete on public.item_people
for each row execute function public.sync_own_after_going();
revoke execute on function public.sync_own_after_going() from public, anon, authenticated;

create function public.sync_own_after_traveler() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
  r record;
begin
  if tg_op = 'DELETE' then v_trip := old.trip_id; else v_trip := new.trip_id; end if;
  -- Nothing to do while the whole trip is being deleted.
  if not exists (select 1 from public.trips where id = v_trip) then return null; end if;
  for r in
    select i.id from public.items i
     where i.trip_id = v_trip and i.pay_mode = 'own'
       and exists (select 1 from public.expenses e where e.item_id = i.id and e.own)
  loop
    perform private.sync_own_status(r.id);
  end loop;
  return null;
end $$;
create trigger travelers_sync_own after insert or delete on public.travelers
for each row execute function public.sync_own_after_traveler();
revoke execute on function public.sync_own_after_traveler() from public, anon, authenticated;

-- ---------- One bill, split: as before, kept apart from own lines ----------
create or replace function public.confirm_item(
  p_item uuid, p_total_cents int, p_paid_by uuid, p_split_mode public.split_mode, p_shares jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  i record;
  v_expense uuid;
begin
  select * into i from public.items where id = p_item;
  if not found then raise exception 'That plan is gone' using errcode = 'P0002'; end if;
  if not private.is_trip_owner(i.trip_id) then raise exception 'Only owners can do that' using errcode = '42501'; end if;
  if i.pay_mode = 'own' then
    if exists (select 1 from public.expenses where item_id = p_item and own) then
      raise exception 'People have logged their own costs on this plan. Clear those to make it one bill' using errcode = '22023';
    end if;
    -- Confirming with one cost and a payer makes it one bill (nothing was logged, so it may switch).
    update public.items set pay_mode = 'split' where id = p_item;
  end if;
  select id into v_expense from public.expenses where item_id = p_item and not own;
  v_expense := private.write_expense(i.trip_id, v_expense, p_item, i.title, i.day, p_total_cents, p_paid_by, p_split_mode, p_shares);
  update public.items set status = 'confirmed' where id = p_item;
  return v_expense;
end $$;

create or replace function public.unconfirm_item(p_item uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
  v_mode public.pay_mode;
begin
  select trip_id, pay_mode into v_trip, v_mode from public.items where id = p_item;
  if v_trip is null or not private.is_trip_owner(v_trip) then
    raise exception 'Only owners can do that' using errcode = '42501';
  end if;
  if v_mode = 'own' then
    raise exception 'On this plan each person clears their own line' using errcode = '22023';
  end if;
  delete from public.expenses where item_id = p_item and not own;
  update public.items set status = 'planned' where id = p_item;
end $$;
