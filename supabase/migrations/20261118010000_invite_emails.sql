-- TripTab: invite emails from triptab.org (Build 3, Mike's 11/18 call). The send-invite Edge Function
-- sends each one through Resend and logs it here, sent or capped; the rate limits are counted from
-- this table. Who it went to is the traveler (their email stays in travelers, owners only); the
-- message itself is not stored.
-- The function writes with the service role; nobody writes from the app. Owners read their trips' rows.

create table public.invite_emails (
  id uuid primary key default gen_random_uuid(),
  -- Kept when a trip or person is deleted, so the daily counts stay whole.
  trip_id uuid references public.trips (id) on delete set null,
  traveler_id uuid references public.travelers (id) on delete set null,
  sent_by uuid not null,
  -- sent, error, or capped_person, capped_trip, capped_sender, capped_total (never sent)
  result text not null,
  created_at timestamptz not null default now()
);
create index invite_emails_created_idx on public.invite_emails (created_at);

alter table public.invite_emails enable row level security;
create policy "owners read their trip's invite emails" on public.invite_emails for select to authenticated
  using (trip_id is not null and private.is_trip_owner(trip_id));

revoke all on public.invite_emails from anon, authenticated;
grant select on public.invite_emails to authenticated;
