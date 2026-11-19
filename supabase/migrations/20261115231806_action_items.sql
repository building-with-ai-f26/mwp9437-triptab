-- TripTab Build 4: action items. What still needs booking or deciding, and who's on it.
-- Owners add, assign and edit them; everyone on the trip sees them; whoever an item is assigned
-- to can tick it off (through set_action_done), even as a viewer.

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 140),
  assignee uuid references public.travelers (id) on delete set null,
  due_day date,
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index action_items_trip_idx on public.action_items (trip_id);

alter table public.action_items enable row level security;
create policy "members read action items" on public.action_items for select to authenticated
  using (private.is_trip_member(trip_id));
create policy "owners add action items" on public.action_items for insert to authenticated
  with check (private.is_trip_owner(trip_id));
create policy "owners change action items" on public.action_items for update to authenticated
  using (private.is_trip_owner(trip_id)) with check (private.is_trip_owner(trip_id));
create policy "owners delete action items" on public.action_items for delete to authenticated
  using (private.is_trip_owner(trip_id));

revoke all on public.action_items from anon;
revoke update on public.action_items from authenticated;
grant update (title, assignee, due_day, done, done_at) on public.action_items to authenticated;

-- The assignee must be on the same trip.
create function public.check_action_assignee() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.assignee is not null and not exists (
    select 1 from public.travelers where id = new.assignee and trip_id = new.trip_id
  ) then
    raise exception 'Assign it to someone on the trip' using errcode = '23514';
  end if;
  if new.done and (tg_op = 'INSERT' or not old.done) then new.done_at := now(); end if;
  if not new.done then new.done_at := null; end if;
  return new;
end $$;
create trigger action_items_check before insert or update on public.action_items
for each row execute function public.check_action_assignee();
revoke execute on function public.check_action_assignee() from public, anon, authenticated;

-- Tick an item off (or back on): owners, or the person it's assigned to.
create function public.set_action_done(p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select ai.trip_id, t.user_id as assignee_user into a
  from public.action_items ai left join public.travelers t on t.id = ai.assignee
  where ai.id = p_id;
  if not found then raise exception 'That item is gone' using errcode = 'P0002'; end if;
  if not (private.is_trip_owner(a.trip_id) or a.assignee_user = auth.uid()) then
    raise exception 'Only owners or the person it''s assigned to can do that' using errcode = '42501';
  end if;
  update public.action_items set done = p_done where id = p_id;
end $$;
revoke execute on function public.set_action_done(uuid, boolean) from public, anon;
grant execute on function public.set_action_done(uuid, boolean) to authenticated;
