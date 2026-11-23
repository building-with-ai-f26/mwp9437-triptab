-- Votes on Suggested plans (11/23 product manager review, item 7): a thumbs up from anyone on the
-- trip, so the group can see which ideas people want. One vote a person a plan; you add or take
-- back only your own. Voting changes nothing else about a plan.
--
-- Who can do what: the people on a trip read its votes; a person adds or removes their own vote,
-- Viewers included; nobody votes as someone else, an Owner included; strangers see nothing.
create table public.item_votes (
  item_id uuid not null references public.items (id) on delete cascade,
  traveler_id uuid not null references public.travelers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, traveler_id)
);
create index item_votes_traveler on public.item_votes (traveler_id);

-- The vote is yours (your own spot) and the plan is on your trip (AGENTS.md rule 10: both ids are
-- checked to go together).
create function private.can_vote(p_item uuid, p_traveler uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.items i
      join public.travelers t on t.trip_id = i.trip_id
     where i.id = p_item and t.id = p_traveler and t.user_id = (select auth.uid())
  )
$$;
revoke execute on function private.can_vote(uuid, uuid) from public, anon;
grant execute on function private.can_vote(uuid, uuid) to authenticated;

alter table public.item_votes enable row level security;
create policy "members read votes" on public.item_votes for select to authenticated
  using (private.is_trip_member(private.trip_of_item(item_id)));
create policy "add your own vote" on public.item_votes for insert to authenticated
  with check (private.can_vote(item_id, traveler_id));
create policy "take back your own vote" on public.item_votes for delete to authenticated
  using (private.can_vote(item_id, traveler_id));

revoke all on public.item_votes from anon, authenticated;
grant select, insert, delete on public.item_votes to authenticated;
