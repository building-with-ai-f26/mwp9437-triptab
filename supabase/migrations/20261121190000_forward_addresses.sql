-- Also forward from (C31, Mike's call 11/21): two flight confirmations forwarded to a trip bounced
-- because they came from an address that isn't on Mike's TripTab account. An account can add more
-- addresses to forward bookings from, each confirmed by a 6-digit code emailed to it, so nobody
-- can claim an address they can't read.
--
-- Only the confirm-email Edge Function (service role) adds an address, sends its code and marks it
-- confirmed. A person reads and removes only their own; the code's hash is never readable.
create table public.forward_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null check (
    email = lower(btrim(email)) and char_length(email) between 6 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  code_hash text check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$'),
  code_sent_at timestamptz,
  tries smallint not null default 0 check (tries between 0 and 10),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);
create index forward_addresses_confirmed on public.forward_addresses (user_id) where confirmed_at is not null;

alter table public.forward_addresses enable row level security;
revoke all on public.forward_addresses from anon, authenticated;
grant select (id, user_id, email, confirmed_at, created_at), delete on public.forward_addresses to authenticated;
create policy "people read their own forwarding addresses" on public.forward_addresses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "people remove their own forwarding addresses" on public.forward_addresses
  for delete to authenticated using (user_id = (select auth.uid()));

-- A code's email counts with confirm-your-email sends against the day's Resend budget
-- (supabase/functions/_shared/account.ts, CONFIRM_LIMITS).
alter table public.account_events drop constraint account_events_kind_check;
alter table public.account_events add constraint account_events_kind_check
  check (kind in ('sign_up', 'confirm_sent', 'forward_code_sent'));
