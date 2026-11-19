-- TripTab: the cost log for AI calls (Build 4). Every call the import-bookings Edge Function makes
-- to the Claude API writes one row here from its first call: the model, effort, tokens, web
-- searches, list-price cost, latency and how it ended. The input text is never stored.
-- The function writes with the service role; nobody writes from the app. Owners read the rows of
-- their own trips. The daily dollar cap and the per-person cap are summed from this table.

create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  -- Kept when a trip is deleted, so the cost log stays whole.
  trip_id uuid references public.trips (id) on delete set null,
  user_id uuid,
  feature text not null default 'import',
  model text not null,
  effort text,
  input_kind text,
  input_chars int,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  searches int not null default 0,
  -- List price in US dollars, from the prices in Plan.md.
  cost_usd numeric(12, 6) not null default 0,
  latency_ms int,
  -- ok, no_plans, refused, invalid_output, timeout, error (blocked calls never reach the API and cost nothing:
  -- capped_daily, capped_user, too_large, off)
  result text not null,
  plans_proposed int,
  test_run boolean not null default false,
  created_at timestamptz not null default now()
);
create index ai_calls_created_idx on public.ai_calls (created_at);
create index ai_calls_trip_idx on public.ai_calls (trip_id);

alter table public.ai_calls enable row level security;
create policy "owners read their trip's AI calls" on public.ai_calls for select to authenticated
  using (trip_id is not null and private.is_trip_owner(trip_id));

revoke all on public.ai_calls from anon, authenticated;
grant select on public.ai_calls to authenticated;
