-- C20 (Mike's call, 11/20): an Owner can add or fix someone's Zelle the way they can a Venmo, until
-- that person sets their own (pay_locked, written only by set_my_pay and the join-time copy). Then
-- only they can change either one. The 11/18 rule kept Zelle to its person alone; Mike chose the
-- Venmo rule for both, since an Owner often knows how a friend gets paid.
grant insert (zelle), update (zelle) on public.travelers to authenticated;

create or replace function private.guard_pay() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.pay_locked
     and (new.venmo is distinct from old.venmo or new.zelle is distinct from old.zelle)
     and (select auth.uid()) is not null
     and (select auth.uid()) is distinct from old.user_id then
    raise exception '% set their own Venmo and Zelle, so only they can change them.', old.name using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger travelers_guard_pay on public.travelers;
create trigger travelers_guard_pay before update of venmo, zelle on public.travelers
  for each row execute function private.guard_pay();
