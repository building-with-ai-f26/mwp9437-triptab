-- TripTab: confirming your email (Mike's 11/18 call, C6) and a rate limit on sign-up (Build 3's
-- security audit). Accounts made with an email and password can be used right away; they carry
-- app_metadata.email_check = 'pending' (set by the sign-up function; nobody can change it from the
-- browser) until the link in the "Confirm your email" email is opened. Google sign-ins are confirmed
-- by Google, and accounts made before this have no flag, so neither sees a reminder.
--
-- Both tables are for the Edge Functions only (service role): no policies, no grants, so the app
-- can neither read nor write them.

-- The current link for each account that hasn't confirmed yet. Only the token's hash is stored.
create table public.email_checks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique,
  sent_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- What the rate limits count: sign-ups (by a hash of the caller's address, never the address) and
-- confirmation emails sent. Kept small: nothing here names a person or holds an email.
create table public.account_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('sign_up', 'confirm_sent')),
  user_id uuid,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index account_events_recent_idx on public.account_events (kind, created_at);

alter table public.email_checks enable row level security;
alter table public.account_events enable row level security;
revoke all on public.email_checks, public.account_events from anon, authenticated;
