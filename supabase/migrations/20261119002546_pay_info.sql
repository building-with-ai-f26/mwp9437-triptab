-- How to pay me (Mike's notes, 11/18, after paying "Jordan" from the pod test trip): a Venmo
-- username and a Zelle phone number or email per person, one form to change them, and once you add
-- your own, they're locked to you.
--
-- - venmo: an Owner can still add or fix someone's Venmo, until that person sets their own.
-- - zelle: only the person adds their own. A phone number or email is more personal than a Venmo
--   username, so an Owner can't put someone's on the trip for them.
-- - pay_locked: true once the person set their own (with set_my_pay). Only set_my_pay and the
--   join-time copy below write it; the browser can't.
-- Everyone on a trip reads all three: it's what they pay to. Rows keep what they had; Venmo names
-- saved before this stay unlocked until their person saves them again.

alter table public.travelers
  add column zelle text constraint travelers_zelle_format check (
    zelle is null
    or (length(zelle) <= 254 and (zelle ~ '^[0-9]{10}$' or zelle ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
  ),
  add column pay_locked boolean not null default false;

grant select (zelle, pay_locked) on public.travelers to authenticated;

-- An Owner's change to a Venmo its person set themselves is refused, whatever the path.
create function private.guard_pay() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.pay_locked
     and new.venmo is distinct from old.venmo
     and (select auth.uid()) is not null
     and (select auth.uid()) is distinct from old.user_id then
    raise exception '% set their own Venmo, so only they can change it.', old.name using errcode = '42501';
  end if;
  return new;
end $$;

create trigger travelers_guard_pay before update of venmo on public.travelers
  for each row execute function private.guard_pay();

-- Joining another trip (or starting one) brings along what you set before, so you're asked once.
create function private.carry_pay() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  src record;
begin
  if new.user_id is not null and (tg_op = 'INSERT' or old.user_id is distinct from new.user_id) then
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

create trigger travelers_carry_pay before insert or update of user_id on public.travelers
  for each row execute function private.carry_pay();

-- Your Venmo and Zelle, on all your trips at once. Blank clears one; clearing both unlocks your
-- spot so an Owner can add a Venmo again.
create function public.set_my_pay(p_venmo text, p_zelle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v text := nullif(btrim(regexp_replace(coalesce(p_venmo, ''), '^\s*@', '')), '');
  z text := nullif(lower(btrim(coalesce(p_zelle, ''))), '');
begin
  if (select auth.uid()) is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  -- A phone number keeps its digits, without a leading US 1.
  if z is not null and z !~ '@' then
    z := regexp_replace(z, '[^0-9]', '', 'g');
    if length(z) = 11 and left(z, 1) = '1' then z := substr(z, 2); end if;
  end if;
  update public.travelers
  set venmo = v, zelle = z, pay_locked = (v is not null or z is not null)
  where user_id = (select auth.uid());
end $$;
revoke execute on function public.set_my_pay(text, text) from public, anon;
grant execute on function public.set_my_pay(text, text) to authenticated;

-- The older Venmo-only save (the app before this) also locks what you set.
create or replace function public.set_my_venmo(p_venmo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v text := nullif(btrim(regexp_replace(coalesce(p_venmo, ''), '^@', '')), '');
begin
  if (select auth.uid()) is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update public.travelers set venmo = v, pay_locked = (v is not null or zelle is not null)
  where user_id = (select auth.uid());
end $$;
