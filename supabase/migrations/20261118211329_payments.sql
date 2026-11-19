-- TripTab: record a payment mid-trip (Build 3, the 11/17 pod feedback). When you pay the Airbnb up
-- front and collect from people in advance, each payment is recorded (who paid whom, how much,
-- when, and how), and balances move at once instead of waiting for the end of the trip.
-- TripTab still never moves money: Venmo is a link out, and cash or another app (Zelle, say) is
-- recorded by hand.
--
-- Who can record one: anyone on the trip for a payment they made or received; an Owner for any.
-- Who can remove one: whoever recorded it, or an Owner. Nobody edits one: remove it and record it
-- again. Everyone on the trip reads them, as they read the tab.

create type public.payment_method as enum ('venmo', 'cash', 'zelle', 'other');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  -- NO ACTION, as on expenses: removing a person who paid or was paid is refused, while deleting
  -- the whole trip clears its payments first (the trigger below).
  from_traveler uuid not null references public.travelers (id),
  to_traveler uuid not null references public.travelers (id),
  amount_cents int not null check (amount_cents > 0 and amount_cents <= 100000000),
  paid_on date not null default current_date,
  method public.payment_method not null default 'venmo',
  note text check (note is null or char_length(note) <= 140),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint payments_two_people check (from_traveler <> to_traveler)
);
create index payments_trip_idx on public.payments (trip_id);

-- Whether a person is on this trip (both sides of a payment must be).
create function private.on_trip(p_trip uuid, p_traveler uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.travelers where id = p_traveler and trip_id = p_trip)
$$;
revoke execute on function private.on_trip(uuid, uuid) from public, anon;
grant execute on function private.on_trip(uuid, uuid) to authenticated;

alter table public.payments enable row level security;
create policy "members read payments" on public.payments for select to authenticated
  using (private.is_trip_member(trip_id));
create policy "record a payment you made or got, or any as an owner" on public.payments for insert to authenticated
  with check (
    private.is_trip_member(trip_id)
    and private.on_trip(trip_id, from_traveler) and private.on_trip(trip_id, to_traveler)
    and (private.is_trip_owner(trip_id) or private.is_my_traveler(from_traveler) or private.is_my_traveler(to_traveler))
  );
create policy "remove a payment you recorded, or any as an owner" on public.payments for delete to authenticated
  using (private.is_trip_owner(trip_id) or created_by = (select auth.uid()));

revoke all on public.payments from anon, authenticated;
grant select, delete on public.payments to authenticated;
-- created_by is always the caller: it isn't in the list, so its default applies.
grant insert (trip_id, from_traveler, to_traveler, amount_cents, paid_on, method, note) on public.payments to authenticated;

-- Deleting a trip clears its payments as well as its expenses before the cascade reaches its people.
create or replace function public.delete_trip_expenses() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.payments where trip_id = old.id;
  delete from public.expenses where trip_id = old.id;
  return old;
end $$;

alter publication supabase_realtime add table public.payments;

-- Venmo: each person's username, so "Pay with Venmo" opens the app with the amount filled in.
-- Everyone on the trip can read it (it's what they pay to); you set your own, on all your trips at
-- once, and an Owner can set it for someone who hasn't joined.
alter table public.travelers add column venmo text
  constraint travelers_venmo_format check (venmo is null or venmo ~ '^[A-Za-z0-9_-]{5,30}$');
grant select (venmo) on public.travelers to authenticated;
grant insert (venmo), update (venmo) on public.travelers to authenticated;

create function public.set_my_venmo(p_venmo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v text := nullif(btrim(regexp_replace(coalesce(p_venmo, ''), '^@', '')), '');
begin
  if (select auth.uid()) is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.travelers set venmo = v where user_id = (select auth.uid());
end $$;
revoke execute on function public.set_my_venmo(text) from public, anon;
grant execute on function public.set_my_venmo(text) to authenticated;
