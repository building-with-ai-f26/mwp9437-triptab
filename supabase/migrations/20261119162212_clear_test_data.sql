-- C18 (Mike's 11/19 call): production is for real people. Before TripTab dev existed (11/18), the
-- click-throughs and live tests ran against production and left about 400 test accounts, all on
-- @example.com, and their trips. This deletes every trip no real person is on, then the test
-- accounts (and the security test's Resend inboxes, should any be left). A real person is any
-- other account, including one with no email; their trips stay whole even where a test account
-- had joined (that spot just loses its sign-in). Kept on purpose: the ai_calls cost log, where the
-- build log's API spend comes from, and the invite_emails log; their rows keep the old ids.
-- On TripTab dev, where nearly every account is a test one, it clears old test data the same way.

-- Every trip no real person created or is on. Expenses go with it (trips_delete_expenses), and
-- stops, people, plans, payments and to-dos by cascade.
delete from public.trips t
where not exists (
    select 1 from public.travelers tr join auth.users u on u.id = tr.user_id
    where tr.trip_id = t.id
      and not coalesce(u.email ilike '%@example.com' or u.email ilike 'delivered+triptab-rls-%@resend.dev', false))
  and not exists (
    select 1 from auth.users u
    where u.id = t.created_by
      and not coalesce(u.email ilike '%@example.com' or u.email ilike 'delivered+triptab-rls-%@resend.dev', false));

-- The test accounts' sign-up log, then the accounts (their email checks go with them).
delete from public.account_events a
using auth.users u
where u.id = a.user_id
  and coalesce(u.email ilike '%@example.com' or u.email ilike 'delivered+triptab-rls-%@resend.dev', false);

delete from auth.users
where coalesce(email ilike '%@example.com' or email ilike 'delivered+triptab-rls-%@resend.dev', false);
