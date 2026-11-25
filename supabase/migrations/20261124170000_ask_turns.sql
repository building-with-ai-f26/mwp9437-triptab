-- T10 (Mike's C59, C60 and C64; the 11/24 pod's version of Ask AI): the Ask AI conversation, kept for
-- the person who asked and nobody else (C60: private to them, even from an Owner of the same trip).
-- An ask and its refinements share a thread; each turn holds what was asked and the options shown.
-- What someone picks lands on the trip as a Suggested plan, where everyone sees it, as before.
--
-- Additive: one new table, nothing existing is rewritten. Idempotent, like plan_payments.

create table if not exists public.ask_turns (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  thread_id uuid not null,
  request text not null check (char_length(request) between 1 and 600),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 6),
  created_at timestamptz not null default now()
);
create index if not exists ask_turns_mine on public.ask_turns (user_id, trip_id, created_at);

alter table public.ask_turns enable row level security;

-- Yours alone: read, add and clear your own turns, on a trip you're on. No one else, an Owner
-- included, can read them, and nobody can edit a turn after the fact.
drop policy if exists "read your own ask turns" on public.ask_turns;
create policy "read your own ask turns" on public.ask_turns for select to authenticated
  using (user_id = (select auth.uid()) and private.is_trip_member(trip_id));

drop policy if exists "add your own ask turns" on public.ask_turns;
create policy "add your own ask turns" on public.ask_turns for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_trip_member(trip_id));

drop policy if exists "clear your own ask turns" on public.ask_turns;
create policy "clear your own ask turns" on public.ask_turns for delete to authenticated
  using (user_id = (select auth.uid()));

revoke truncate, references, trigger, update on public.ask_turns from anon, authenticated;
revoke all on public.ask_turns from anon;
