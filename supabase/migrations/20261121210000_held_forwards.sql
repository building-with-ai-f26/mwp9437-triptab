-- Forwards from any address, held for an Owner (C36, Mike's call 11/21: "sort of annoying to have to
-- add every email you forward from"). An email to a trip's address from someone who isn't on the
-- trip is no longer bounced, and isn't read either: it waits on the trip as "From x@gmail.com, not on
-- this trip" until an Owner taps Read it (the AI reads it then) or That's me (that address counts as
-- theirs from then on), or dismisses it. At most 5 such emails a trip a day (inbox-email/rules.ts).
-- So a trip address that leaks can't run up AI calls or put a stranger's links in front of the group
-- unread.

-- Who a held email came from, shown to the trip's Owners (they already see who sent the others).
alter table public.inbox_items
  add column from_address text check (from_address is null or (char_length(from_address) <= 254 and from_address ~ '^[^@\s]+@[^@\s]+$'));
alter table public.inbox_items drop constraint inbox_items_status_check;
alter table public.inbox_items add constraint inbox_items_status_check
  check (status in ('new', 'saved', 'dismissed', 'failed', 'held'));

-- What import would read in a held email (its text and first PDF or photo), and nothing else of it.
-- Only the inbox-email function (service role) reads or writes it. It goes when the email is read or
-- dismissed, and after 7 days (inbox-email clears old ones when the next email comes in).
create table public.inbox_held (
  item_id uuid primary key references public.inbox_items (id) on delete cascade,
  input jsonb not null,
  created_at timestamptz not null default now()
);
create index inbox_held_created on public.inbox_held (created_at);
alter table public.inbox_held enable row level security;
revoke all on public.inbox_held from anon, authenticated;

-- Dismissed (or read): the held email goes at once.
create function private.drop_held_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'held' then
    delete from public.inbox_held where item_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function private.drop_held_email() from public, anon, authenticated;
create trigger inbox_items_drop_held after update of status on public.inbox_items
  for each row execute function private.drop_held_email();
