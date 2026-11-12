-- TripTab Build 3: confirming a plan logs its cost, who paid and who's in, in one step;
-- general expenses (a grocery run) go on the tab without a plan; people opt in and out.
-- Rule from the spring post-mortem: confirming writes the plan and its expense together.

create type public.split_mode as enum ('even', 'shares', 'percent', 'exact');

-- Money that changed hands. item_id links it to the plan it paid for; null for a general expense.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  item_id uuid unique references public.items (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 140),
  day date,
  total_cents int not null check (total_cents >= 0 and total_cents <= 100000000),
  paid_by uuid not null references public.travelers (id) on delete restrict,
  split_mode public.split_mode not null default 'even',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index expenses_trip_idx on public.expenses (trip_id);

-- Each person's part of an expense. weight holds the shares or percent they were given.
create table public.expense_shares (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  traveler_id uuid not null references public.travelers (id) on delete restrict,
  amount_cents int not null check (amount_cents >= 0),
  weight numeric,
  primary key (expense_id, traveler_id)
);

-- Who's going to a plan. No row means the default: in for everything except flights,
-- which are per person (you're only on the flights you're on).
create table public.item_people (
  item_id uuid not null references public.items (id) on delete cascade,
  traveler_id uuid not null references public.travelers (id) on delete cascade,
  going boolean not null,
  primary key (item_id, traveler_id)
);

-- ---------- Helpers ----------
create function private.trip_of_item(p_item uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select trip_id from public.items where id = p_item
$$;

-- You can set your own going; owners can set anyone's.
create function private.can_set_going(p_item uuid, p_traveler uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.items i
    join public.travelers t on t.id = p_traveler and t.trip_id = i.trip_id
    where i.id = p_item
      and (t.user_id = auth.uid() or private.is_trip_owner(i.trip_id))
  )
$$;
grant execute on function private.trip_of_item(uuid), private.can_set_going(uuid, uuid) to authenticated;

-- ---------- Row-level security ----------
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.item_people enable row level security;

create policy "members read expenses" on public.expenses for select to authenticated
  using (private.is_trip_member(trip_id));
-- Only general expenses are deleted directly; a plan's expense goes with "undo confirm".
create policy "owners delete general expenses" on public.expenses for delete to authenticated
  using (item_id is null and private.is_trip_owner(trip_id));

create policy "members read shares" on public.expense_shares for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_trip_member(e.trip_id)));

create policy "members read who's going" on public.item_people for select to authenticated
  using (private.is_trip_member(private.trip_of_item(item_id)));
create policy "set your own going, or anyone's as owner" on public.item_people for insert to authenticated
  with check (private.can_set_going(item_id, traveler_id));
create policy "change your own going, or anyone's as owner" on public.item_people for update to authenticated
  using (private.can_set_going(item_id, traveler_id)) with check (private.can_set_going(item_id, traveler_id));
create policy "clear your own going, or anyone's as owner" on public.item_people for delete to authenticated
  using (private.can_set_going(item_id, traveler_id));

revoke all on public.expenses, public.expense_shares, public.item_people from anon;
revoke insert, update on public.expenses, public.expense_shares from authenticated;
revoke update on public.item_people from authenticated;
grant update (going) on public.item_people to authenticated;

-- ---------- Confirmed means paid ----------
-- A plan can only become Confirmed through confirm_item(), which writes its expense first,
-- and can only leave Confirmed through unconfirm_item(), which removes it.
create function public.guard_confirmed() returns trigger
language plpgsql set search_path = '' as $$
begin
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
create trigger items_guard_confirmed before insert or update of status on public.items
for each row execute function public.guard_confirmed();
revoke execute on function public.guard_confirmed() from public, anon, authenticated;

-- Writes an expense and its shares after checking them. Used by both functions below.
create function private.write_expense(
  p_trip uuid, p_expense uuid, p_item uuid, p_description text, p_day date,
  p_total int, p_paid_by uuid, p_mode public.split_mode, p_shares jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_expense;
  v_sum bigint;
  v_bad int;
begin
  if not private.is_trip_owner(p_trip) then raise exception 'Only owners can do that' using errcode = '42501'; end if;
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

-- Confirm a plan: its real cost, who paid, who's in and how it's split, and status Confirmed,
-- all in one transaction. Calling it again on a confirmed plan edits the expense.
create function public.confirm_item(
  p_item uuid, p_total_cents int, p_paid_by uuid, p_split_mode public.split_mode, p_shares jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  i record;
  v_expense uuid;
begin
  select * into i from public.items where id = p_item;
  if not found then raise exception 'That plan is gone' using errcode = 'P0002'; end if;
  select id into v_expense from public.expenses where item_id = p_item;
  v_expense := private.write_expense(i.trip_id, v_expense, p_item, i.title, i.day, p_total_cents, p_paid_by, p_split_mode, p_shares);
  update public.items set status = 'confirmed' where id = p_item;
  return v_expense;
end $$;

-- Undo a confirmation: the expense goes and the plan is Planned again.
create function public.unconfirm_item(p_item uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  select trip_id into v_trip from public.items where id = p_item;
  if v_trip is null or not private.is_trip_owner(v_trip) then
    raise exception 'Only owners can do that' using errcode = '42501';
  end if;
  delete from public.expenses where item_id = p_item;
  update public.items set status = 'planned' where id = p_item;
end $$;

-- A general expense: on the tab without a plan (groceries for the house).
create function public.save_expense(
  p_trip uuid, p_expense uuid, p_description text, p_day date,
  p_total_cents int, p_paid_by uuid, p_split_mode public.split_mode, p_shares jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if p_expense is not null and exists (select 1 from public.expenses where id = p_expense and item_id is not null) then
    raise exception 'Edit a plan''s cost by confirming the plan again' using errcode = '22023';
  end if;
  return private.write_expense(p_trip, p_expense, null, p_description, p_day, p_total_cents, p_paid_by, p_split_mode, p_shares);
end $$;

revoke execute on function private.write_expense(uuid, uuid, uuid, text, date, int, uuid, public.split_mode, jsonb) from public, anon, authenticated;
revoke execute on function public.confirm_item(uuid, int, uuid, public.split_mode, jsonb) from public, anon;
revoke execute on function public.unconfirm_item(uuid) from public, anon;
revoke execute on function public.save_expense(uuid, uuid, text, date, int, uuid, public.split_mode, jsonb) from public, anon;
grant execute on function public.confirm_item(uuid, int, uuid, public.split_mode, jsonb) to authenticated;
grant execute on function public.unconfirm_item(uuid) to authenticated;
grant execute on function public.save_expense(uuid, uuid, text, date, int, uuid, public.split_mode, jsonb) to authenticated;
