-- TripTab Build 2: trips, stops, travelers (people + roles), the group link, itinerary items.
-- Every table has row-level security. Roles live on the server, never in a link:
-- Owners change the trip; Viewers read it. Joining through the group link goes through
-- join_trip(), which checks the token and gives the role the owner set.

-- ---------- Types ----------
create type public.trip_role as enum ('owner', 'viewer');
create type public.item_status as enum ('suggested', 'planned', 'confirmed');
create type public.item_kind as enum ('activity', 'meal', 'transport', 'flight', 'stay');
create type public.day_part as enum ('morning', 'day', 'evening', 'night');
create type public.cost_type as enum ('total', 'per_person');

-- ---------- Tables ----------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  start_date date not null,
  end_date date not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 60)
);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  start_date date not null,
  end_date date not null,
  position int not null default 0,
  check (end_date >= start_date)
);
create index stops_trip_idx on public.stops (trip_id);

-- A person on the trip. Added directly by an owner (user_id null until they claim the spot)
-- or by joining through the group link.
create table public.travelers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 32),
  role public.trip_role not null default 'viewer',
  user_id uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  added_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (trip_id, user_id)
);
create unique index travelers_trip_name_idx on public.travelers (trip_id, lower(btrim(name)));
create index travelers_user_idx on public.travelers (user_id);

-- One group link per trip. Only owners can read the token.
create table public.trip_links (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  default_role public.trip_role not null default 'owner',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- One record per itinerary item, carrying its status (the spring post-mortem rule).
create table public.items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  kind public.item_kind not null default 'activity',
  title text not null check (char_length(btrim(title)) between 1 and 140),
  day date not null,
  part public.day_part not null default 'day',
  end_day date,
  location text check (location is null or char_length(location) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  status public.item_status not null default 'suggested',
  est_cents int check (est_cents is null or est_cents >= 0),
  cost_type public.cost_type not null default 'total',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'stay' or (end_day is not null and end_day > day)),
  check (kind = 'stay' or end_day is null)
);
create index items_trip_idx on public.items (trip_id);

-- ---------- Role helpers (security definer so policies don't recurse through travelers) ----------
create function public.my_trip_role(p_trip uuid) returns public.trip_role
language sql stable security definer set search_path = '' as $$
  select t.role from public.travelers t where t.trip_id = p_trip and t.user_id = auth.uid() limit 1
$$;

create function public.is_trip_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.travelers t where t.trip_id = p_trip and t.user_id = auth.uid())
$$;

create function public.is_trip_owner(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.travelers t
    where t.trip_id = p_trip and t.user_id = auth.uid() and t.role = 'owner'
  )
$$;

-- ---------- Integrity triggers ----------
-- Items stay inside the trip's dates.
create function public.check_item_dates() returns trigger
language plpgsql set search_path = '' as $$
declare t record;
begin
  select start_date, end_date into t from public.trips where id = new.trip_id;
  if new.day < t.start_date or new.day > t.end_date then
    raise exception 'Pick a day inside the trip' using errcode = '23514';
  end if;
  if new.kind = 'stay' and new.end_day > t.end_date + 1 then
    raise exception 'Check-out can''t be more than a day after the trip ends' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger items_check_dates before insert or update on public.items
for each row execute function public.check_item_dates();

-- A trip always keeps at least one owner who has signed in, so nobody can lock everyone out.
create function public.keep_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.trips where id = old.trip_id) then
    return null; -- the whole trip is being deleted
  end if;
  if not exists (
    select 1 from public.travelers
    where trip_id = old.trip_id and role = 'owner' and user_id is not null
  ) then
    raise exception 'A trip needs at least one owner' using errcode = '23514';
  end if;
  return null;
end $$;
create trigger travelers_keep_owner after update or delete on public.travelers
for each row execute function public.keep_an_owner();

-- ---------- Row-level security ----------
alter table public.trips enable row level security;
alter table public.stops enable row level security;
alter table public.travelers enable row level security;
alter table public.trip_links enable row level security;
alter table public.items enable row level security;

-- Trips: members read; owners rename, redate, delete. Created only through create_trip().
create policy "members read trips" on public.trips for select to authenticated using (public.is_trip_member(id));
create policy "owners update trips" on public.trips for update to authenticated
  using (public.is_trip_owner(id)) with check (public.is_trip_owner(id));
create policy "owners delete trips" on public.trips for delete to authenticated using (public.is_trip_owner(id));

-- Stops: members read; owners change.
create policy "members read stops" on public.stops for select to authenticated using (public.is_trip_member(trip_id));
create policy "owners add stops" on public.stops for insert to authenticated with check (public.is_trip_owner(trip_id));
create policy "owners update stops" on public.stops for update to authenticated
  using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));
create policy "owners delete stops" on public.stops for delete to authenticated using (public.is_trip_owner(trip_id));

-- Travelers: members see who's on the trip; owners add, edit roles and remove.
-- Claiming a spot (setting user_id) only happens inside join_trip().
create policy "members read travelers" on public.travelers for select to authenticated using (public.is_trip_member(trip_id));
create policy "owners add travelers" on public.travelers for insert to authenticated
  with check (public.is_trip_owner(trip_id) and user_id is null);
create policy "owners update travelers" on public.travelers for update to authenticated
  using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));
create policy "owners remove travelers" on public.travelers for delete to authenticated using (public.is_trip_owner(trip_id));

-- Group link: owners only (a viewer can't hand out a link that grants more than they have).
create policy "owners read link" on public.trip_links for select to authenticated using (public.is_trip_owner(trip_id));
create policy "owners update link" on public.trip_links for update to authenticated
  using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));

-- Items: members read; owners add, change and remove.
create policy "members read items" on public.items for select to authenticated using (public.is_trip_member(trip_id));
create policy "owners add items" on public.items for insert to authenticated with check (public.is_trip_owner(trip_id));
create policy "owners update items" on public.items for update to authenticated
  using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));
create policy "owners delete items" on public.items for delete to authenticated using (public.is_trip_owner(trip_id));

-- ---------- Column privileges (defense in depth under the policies) ----------
revoke all on public.trips, public.stops, public.travelers, public.trip_links, public.items from anon;
revoke insert, update on public.trips from authenticated;
grant update (name, start_date, end_date) on public.trips to authenticated;
revoke insert, update on public.travelers from authenticated;
grant insert (trip_id, name, email, phone, role) on public.travelers to authenticated;
grant update (name, email, phone, role) on public.travelers to authenticated;
revoke insert, update on public.trip_links from authenticated;
grant update (default_role, enabled) on public.trip_links to authenticated;
revoke update on public.items from authenticated;
grant update (kind, title, day, part, end_day, location, notes, status, est_cents, cost_type) on public.items to authenticated;

-- ---------- Functions the app calls ----------

-- Start a trip: the trip, its stops, you as its first owner, and its group link, in one step.
create function public.create_trip(p_name text, p_stops jsonb, p_my_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
  v_start date;
  v_end date;
  s jsonb;
  i int := 0;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then
    raise exception 'Add at least one stop with dates' using errcode = '22023';
  end if;
  if jsonb_array_length(p_stops) > 20 then raise exception 'Up to 20 stops' using errcode = '22023'; end if;
  select min((e->>'start_date')::date), max((e->>'end_date')::date) into v_start, v_end
  from jsonb_array_elements(p_stops) e;

  insert into public.trips (name, start_date, end_date, created_by)
  values (btrim(p_name), v_start, v_end, auth.uid()) returning id into v_trip;

  for s in select * from jsonb_array_elements(p_stops) loop
    insert into public.stops (trip_id, name, start_date, end_date, position)
    values (v_trip, btrim(s->>'name'), (s->>'start_date')::date, (s->>'end_date')::date, i);
    i := i + 1;
  end loop;

  insert into public.travelers (trip_id, name, role, user_id, claimed_at, added_by)
  values (v_trip, coalesce(nullif(btrim(p_my_name), ''), 'Me'), 'owner', auth.uid(), now(), auth.uid());

  insert into public.trip_links (trip_id) values (v_trip);
  return v_trip;
end $$;

-- What someone opening the group link sees before joining: the trip and the names to pick from.
-- Only works while the owner keeps the link on.
create function public.join_preview(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  l record;
  v jsonb;
begin
  select * into l from public.trip_links where token = p_token and enabled;
  if not found then return null; end if;
  select jsonb_build_object(
    'trip_id', t.id,
    'name', t.name,
    'start_date', t.start_date,
    'end_date', t.end_date,
    'default_role', l.default_role,
    'stops', coalesce((select jsonb_agg(s.name order by s.position) from public.stops s where s.trip_id = t.id), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', tr.id, 'name', tr.name, 'claimed', tr.user_id is not null) order by tr.created_at)
      from public.travelers tr where tr.trip_id = t.id
    ), '[]'::jsonb),
    'my_traveler_id', (select tr.id from public.travelers tr where tr.trip_id = t.id and tr.user_id = auth.uid())
  ) into v
  from public.trips t where t.id = l.trip_id;
  return v;
end $$;

-- Join through the group link: claim an unclaimed name, or add yourself.
-- A claimed name keeps the role the owner gave that person; a new name gets the link's default.
create function public.join_trip(p_token text, p_traveler_id uuid default null, p_new_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  l record;
  v_existing uuid;
  v_count int;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into l from public.trip_links where token = p_token and enabled;
  if not found then raise exception 'This link isn''t active' using errcode = 'P0002'; end if;

  select id into v_existing from public.travelers where trip_id = l.trip_id and user_id = auth.uid();
  if v_existing is not null then return l.trip_id; end if; -- already on the trip

  if p_traveler_id is not null then
    update public.travelers
       set user_id = auth.uid(), claimed_at = now()
     where id = p_traveler_id and trip_id = l.trip_id and user_id is null;
    get diagnostics v_count = row_count;
    if v_count = 0 then raise exception 'That name was already claimed' using errcode = '23505'; end if;
  else
    if p_new_name is null or btrim(p_new_name) = '' then
      raise exception 'Pick your name or add it' using errcode = '22023';
    end if;
    if exists (select 1 from public.travelers where trip_id = l.trip_id and lower(btrim(name)) = lower(btrim(p_new_name))) then
      raise exception 'That name is already on the trip; pick it from the list' using errcode = '23505';
    end if;
    insert into public.travelers (trip_id, name, role, user_id, claimed_at, added_by)
    values (l.trip_id, btrim(p_new_name), l.default_role, auth.uid(), now(), auth.uid());
  end if;
  return l.trip_id;
end $$;

-- Owners can retire the old link and make a new one.
create function public.reset_group_link(p_trip uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not public.is_trip_owner(p_trip) then raise exception 'Only owners can do that' using errcode = '42501'; end if;
  update public.trip_links set token = encode(extensions.gen_random_bytes(18), 'hex')
   where trip_id = p_trip returning token into v_token;
  return v_token;
end $$;

revoke execute on function public.create_trip(text, jsonb, text) from public, anon;
revoke execute on function public.join_trip(text, uuid, text) from public, anon;
revoke execute on function public.reset_group_link(uuid) from public, anon;
revoke execute on function public.join_preview(text) from public;
grant execute on function public.create_trip(text, jsonb, text) to authenticated;
grant execute on function public.join_trip(text, uuid, text) to authenticated;
grant execute on function public.reset_group_link(uuid) to authenticated;
grant execute on function public.join_preview(text) to anon, authenticated;
revoke execute on function public.my_trip_role(uuid), public.is_trip_member(uuid), public.is_trip_owner(uuid) from public, anon;
grant execute on function public.my_trip_role(uuid), public.is_trip_member(uuid), public.is_trip_owner(uuid) to authenticated;
