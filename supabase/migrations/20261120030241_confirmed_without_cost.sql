-- C21 (Mike's call, 11/20, from his 11/19 review): Confirmed no longer has to mean paid. A plan
-- with no cost (a christening, a season-pass ski day) or one booked before its price is known can be
-- Confirmed on its own; the green "$ ✓" still marks one whose cost is in. The rest holds:
-- - One bill: once a cost is in (confirm_item writes it, and works on a Confirmed plan too), the
--   plan leaves Confirmed only through unconfirm_item, which takes the cost back out.
-- - Each pays their own: while nobody has logged a line it can be Confirmed like any plan; once
--   lines are in, it's Confirmed exactly when everyone going has booked (sync_own_status).
create or replace function public.guard_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_going int;
  v_booked int;
begin
  if new.pay_mode = 'own' then
    if not exists (select 1 from public.expenses where item_id = new.id and own) then
      return new;
    end if;
    select c.going, c.booked into v_going, v_booked from private.own_counts(new.id) c;
    if new.status = 'confirmed' and not (coalesce(v_going, 0) > 0 and v_booked = v_going) then
      raise exception 'It''s confirmed once everyone going has logged their own cost' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.status = 'confirmed' and new.status <> 'confirmed'
       and coalesce(v_going, 0) > 0 and v_booked = v_going then
      raise exception 'Everyone going has booked, so it stays confirmed until a line is cleared' using errcode = '23514';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' and new.status <> 'confirmed'
     and exists (select 1 from public.expenses where item_id = new.id) then
    raise exception 'Undo the confirmation to change its status' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.guard_confirmed() from public, anon, authenticated;
