-- Mike's ask, 11/22: delete the two accounts the security test made on production that day
-- (app/e2e/rls-proof.cjs, C14: two labeled accounts on Resend's test inboxes, deleted right after).
-- Production is read-only for the coding agent, so they go by migration, as the 11/19 run's did.
--
-- Only these two addresses, by name. Neither is on a trip: the test deleted both of its trips. Their
-- sign-up log rows go first, then the accounts; their sign-ins, sessions and email checks go with
-- them. On TripTab dev these addresses don't exist, so this does nothing there.
delete from public.account_events a
using auth.users u
where u.id = a.user_id
  and u.email in ('delivered+triptab-rls-dq0pk-a@resend.dev', 'delivered+triptab-rls-dq0pk-b@resend.dev');

delete from auth.users
where email in ('delivered+triptab-rls-dq0pk-a@resend.dev', 'delivered+triptab-rls-dq0pk-b@resend.dev');
