-- T7 (Mike's 11/23 ski trip test; C63, his OK 11/24 to take this to production): a payment schedule
-- on a plan, for deposits and installments ("1,000 EUR paid 11/18, 2,000 EUR due 12/11").
--
-- Additive: one new table, nothing existing is rewritten. The plan keeps its one bill (expenses, one
-- non-own row per plan); the app keeps that bill equal to the sum of the payments marked paid, so
-- settle-up, who's in and everything else that reads the bill work as before. Unpaid payments are
-- "coming up" and stay out of every balance until they're paid.
--
-- Idempotent on purpose (create ... if not exists, drop ... if exists): it was run on TripTab dev by
-- hand while being built, and the pull request's build then applies this file.

create table if not exists public.plan_payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  position int not null default 0,
  -- In dollars: as paid, or an estimate at the day's rate while a foreign payment is still to come.
  amount_cents int not null check (amount_cents >= 0 and amount_cents <= 100000000),
  -- A payment in another currency, as written on the booking (C28, C33).
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  foreign_cents int check (foreign_cents is null or foreign_cents >= 0),
  due_day date,
  paid boolean not null default false,
  paid_on date,
  paid_by uuid not null references public.travelers (id) on delete cascade,
  -- The "Pay <plan>: payment 2" to-do for an unpaid payment with a due date.
  action_id uuid references public.action_items (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists plan_payments_item on public.plan_payments (item_id);
create index if not exists plan_payments_trip on public.plan_payments (trip_id);

alter table public.plan_payments enable row level security;

-- A payment belongs to its plan's trip, its payer is on that trip, and its to-do too (AGENTS.md
-- rule 10: two ids that must go together are checked together).
create or replace function private.plan_payment_fits(p_trip uuid, p_item uuid, p_paid_by uuid, p_action uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.items i where i.id = p_item and i.trip_id = p_trip)
     and exists (select 1 from public.travelers t where t.id = p_paid_by and t.trip_id = p_trip)
     and (p_action is null or exists (select 1 from public.action_items a where a.id = p_action and a.trip_id = p_trip))
$$;
revoke execute on function private.plan_payment_fits(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function private.plan_payment_fits(uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists "members read plan payments" on public.plan_payments;
create policy "members read plan payments" on public.plan_payments for select to authenticated
  using (private.is_trip_member(trip_id));

drop policy if exists "owners add plan payments" on public.plan_payments;
create policy "owners add plan payments" on public.plan_payments for insert to authenticated
  with check (private.is_trip_owner(trip_id) and private.plan_payment_fits(trip_id, item_id, paid_by, action_id));

drop policy if exists "owners change plan payments" on public.plan_payments;
create policy "owners change plan payments" on public.plan_payments for update to authenticated
  using (private.is_trip_owner(trip_id))
  with check (private.is_trip_owner(trip_id) and private.plan_payment_fits(trip_id, item_id, paid_by, action_id));

drop policy if exists "owners remove plan payments" on public.plan_payments;
create policy "owners remove plan payments" on public.plan_payments for delete to authenticated
  using (private.is_trip_owner(trip_id));

revoke truncate, references, trigger on public.plan_payments from anon, authenticated;
revoke all on public.plan_payments from anon;
