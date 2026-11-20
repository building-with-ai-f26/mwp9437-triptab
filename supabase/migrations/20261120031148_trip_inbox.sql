-- Email-in (Mike's call, 11/20): each trip can have a private address, trip+<code>@triptab.org, the
-- way Wanderlog gives each trip its own (Mike's pointer, 11/20). A booking
-- confirmation that someone on the trip forwards there goes through AI import (the inbox-email Edge
-- Function, called by the triptab Worker's email handler) and waits on the trip for an Owner to
-- review. Nothing becomes a plan on its own.

-- One address per trip. The token is its code (16 hex characters, 64 random bits); mail is taken only
-- from someone on the trip, and an Owner can replace the code. Nobody reads the table directly: Owners get the
-- address through inbox_address(), and the Edge Function reads it with the service role.
create table public.trip_inboxes (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{16}$'),
  created_at timestamptz not null default now()
);
alter table public.trip_inboxes enable row level security;
revoke all on public.trip_inboxes from anon, authenticated;

-- What came in, and what import found in it. Only the Edge Function (service role) writes a row;
-- an Owner reads the trip's and marks one saved or dismissed. The email itself is never stored:
-- only who it came from on the trip, its subject, and the proposed plans.
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_traveler uuid references public.travelers(id) on delete set null,
  subject text check (subject is null or length(subject) <= 200),
  received_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'saved', 'dismissed', 'failed')),
  plans jsonb not null default '[]'::jsonb,
  note text check (note is null or length(note) <= 500),
  call_id uuid references public.ai_calls(id) on delete set null
);
create index inbox_items_trip on public.inbox_items (trip_id, received_at desc);
alter table public.inbox_items enable row level security;
revoke all on public.inbox_items from anon, authenticated;
grant select, update (status) on public.inbox_items to authenticated;
create policy "owners read the trip's inbox" on public.inbox_items
  for select to authenticated using (private.is_trip_owner(trip_id));
create policy "owners mark what came in" on public.inbox_items
  for update to authenticated
  using (private.is_trip_owner(trip_id))
  with check (private.is_trip_owner(trip_id) and status in ('saved', 'dismissed'));
alter publication supabase_realtime add table public.inbox_items;

-- The trip's address (made the first time an Owner asks), and a fresh one in its place.
create function public.inbox_address(p_trip uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not private.is_trip_owner(p_trip) then raise exception 'Only owners can do that' using errcode = '42501'; end if;
  insert into public.trip_inboxes (trip_id, token) values (p_trip, encode(extensions.gen_random_bytes(8), 'hex'))
  on conflict (trip_id) do nothing;
  select token into v_token from public.trip_inboxes where trip_id = p_trip;
  return v_token;
end $$;

create function public.reset_inbox(p_trip uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not private.is_trip_owner(p_trip) then raise exception 'Only owners can do that' using errcode = '42501'; end if;
  insert into public.trip_inboxes (trip_id, token) values (p_trip, encode(extensions.gen_random_bytes(8), 'hex'))
  on conflict (trip_id) do update set token = excluded.token, created_at = now();
  select token into v_token from public.trip_inboxes where trip_id = p_trip;
  return v_token;
end $$;

revoke execute on function public.inbox_address(uuid) from public, anon;
revoke execute on function public.reset_inbox(uuid) from public, anon;
grant execute on function public.inbox_address(uuid) to authenticated;
grant execute on function public.reset_inbox(uuid) to authenticated;
