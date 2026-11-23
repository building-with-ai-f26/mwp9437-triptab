-- Your profile (C50, Mike's call 11/23): Venmo, Zelle and phone kept once, on a page of your own,
-- filled in on every trip you join, with one lock you set there. Your name stays on your account
-- and your email stays the one you sign in with; neither is stored here.
--
-- Locked (the default once you save): no Owner can change your Venmo, Zelle or phone on any trip.
-- Unlocked: an Owner of a trip you're on can add or fix them, on that trip.
--
-- What changes about who can change what:
--   - the lock is now yours to turn off without clearing your details (before, a spot unlocked only
--     when both Venmo and Zelle were blank);
--   - the lock covers phone as well as Venmo and Zelle (before, an Owner could always change the
--     phone they'd typed for someone).
-- Nothing changes about who can read what: a profile is read by its own person only, and trips
-- show Venmo and Zelle to the people on them and phone to Owners, as before.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text constraint profiles_phone_length check (phone is null or char_length(phone) <= 32),
  venmo text constraint profiles_venmo_format check (venmo is null or venmo ~ '^[A-Za-z0-9_-]{5,30}$'),
  zelle text constraint profiles_zelle_format check (
    zelle is null
    or (length(zelle) <= 254 and (zelle ~ '^[0-9]{10}$' or zelle ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
  ),
  locked boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "read your own profile" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
-- No insert, update or delete from the browser: save_my_profile and set_my_pay write it.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Venmo as typed ("@mike-tt") and Zelle as typed ("(555) 123-4567") to how they're stored.
create function private.clean_venmo(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(coalesce(p, ''), '^\s*@', '')), '')
$$;
create function private.clean_zelle(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare z text := nullif(lower(btrim(coalesce(p, ''))), '');
begin
  -- A phone number keeps its digits, without a leading US 1.
  if z is not null and z !~ '@' then
    z := regexp_replace(z, '[^0-9]', '', 'g');
    if length(z) = 11 and left(z, 1) = '1' then z := substr(z, 2); end if;
  end if;
  return z;
end $$;

revoke execute on function private.clean_venmo(text), private.clean_zelle(text) from public, anon, authenticated;

-- Your profile as the page shows it. Before you've saved one, it starts from what your trips hold.
create function public.my_profile() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('venmo', p.venmo, 'zelle', p.zelle, 'phone', p.phone, 'locked', p.locked, 'saved', true)
       from public.profiles p where p.user_id = (select auth.uid())),
    (select jsonb_build_object('venmo', t.venmo, 'zelle', t.zelle, 'phone', null, 'locked', true, 'saved', false)
       from public.travelers t
      where t.user_id = (select auth.uid()) and t.pay_locked
      order by t.created_at desc limit 1),
    jsonb_build_object('venmo', null, 'zelle', null, 'phone', null, 'locked', true, 'saved', false)
  )
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- Save your profile and put it on every trip you're on. A blank phone leaves whatever a trip's
-- Owner typed for you there; a blank Venmo or Zelle clears it everywhere.
create function public.save_my_profile(p_venmo text, p_zelle text, p_phone text, p_locked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  v text := private.clean_venmo(p_venmo);
  z text := private.clean_zelle(p_zelle);
  ph text := nullif(btrim(coalesce(p_phone, '')), '');
  lk boolean := coalesce(p_locked, true);
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into public.profiles (user_id, venmo, zelle, phone, locked)
  values (me, v, z, ph, lk)
  on conflict (user_id) do update
    set venmo = excluded.venmo, zelle = excluded.zelle, phone = excluded.phone, locked = excluded.locked, updated_at = now();
  update public.travelers
     set venmo = v, zelle = z, phone = coalesce(ph, phone), pay_locked = lk
   where user_id = me;
end $$;
revoke execute on function public.save_my_profile(text, text, text, boolean) from public, anon;
grant execute on function public.save_my_profile(text, text, text, boolean) to authenticated;

-- The quick save from Settle up and People keeps its rule (saving your own locks it; clearing both
-- unlocks), and now keeps your profile in step, so the profile page shows the same thing.
create or replace function public.set_my_pay(p_venmo text, p_zelle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  v text := private.clean_venmo(p_venmo);
  z text := private.clean_zelle(p_zelle);
  lk boolean := (v is not null or z is not null);
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into public.profiles (user_id, venmo, zelle, locked)
  values (me, v, z, lk)
  on conflict (user_id) do update
    set venmo = excluded.venmo, zelle = excluded.zelle, locked = excluded.locked, updated_at = now();
  update public.travelers set venmo = v, zelle = z, pay_locked = lk where user_id = me;
end $$;

-- A locked spot refuses an Owner's change to its Venmo, Zelle or phone, whatever the path.
create or replace function private.guard_pay() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.pay_locked
     and (select auth.uid()) is not null
     and (select auth.uid()) is distinct from old.user_id then
    if new.venmo is distinct from old.venmo or new.zelle is distinct from old.zelle then
      raise exception '% set their own Venmo and Zelle, so only they can change them.', old.name using errcode = '42501';
    end if;
    if new.phone is distinct from old.phone then
      raise exception '% locked their phone number, so only they can change it.', old.name using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger travelers_guard_pay on public.travelers;
create trigger travelers_guard_pay before update of venmo, zelle, phone on public.travelers
  for each row execute function private.guard_pay();

-- Joining a trip (or starting one) fills in your spot from your profile. Locked, the spot holds
-- exactly what your profile does; unlocked, anything your profile leaves blank keeps what the
-- Owner typed. With no profile saved yet, it brings along what you set on another trip, as before.
create or replace function private.carry_pay() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p record;
  src record;
begin
  if new.user_id is not null and (tg_op = 'INSERT' or old.user_id is distinct from new.user_id) then
    select * into p from public.profiles where user_id = new.user_id;
    if found then
      if p.locked then
        new.venmo := p.venmo;
        new.zelle := p.zelle;
      else
        new.venmo := coalesce(p.venmo, new.venmo);
        new.zelle := coalesce(p.zelle, new.zelle);
      end if;
      new.phone := coalesce(p.phone, new.phone);
      new.pay_locked := p.locked;
      return new;
    end if;
    select t.venmo, t.zelle into src
    from public.travelers t
    where t.user_id = new.user_id and t.pay_locked and t.id <> new.id
    order by t.created_at desc
    limit 1;
    if found then
      new.venmo := src.venmo;
      new.zelle := src.zelle;
      new.pay_locked := true;
    end if;
  end if;
  return new;
end $$;
