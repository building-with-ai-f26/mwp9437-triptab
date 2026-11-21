-- An own-pay plan Confirmed by hand stays Confirmed while nobody has logged a cost on it (Mike's
-- calls, 11/21: C26, a round trip is two plans and one expense, so the return leg is Confirmed on the
-- outbound's fare; C27, paid with the amount to come is Confirmed now). C21 (11/20) let a plan be
-- Confirmed without a cost, but sync_own_status, from 11/16, still turned any Confirmed own plan back
-- to Planned whenever someone opted in or out, including the creator being put on their own flight.
-- Once lines are logged, nothing changes: Confirmed when everyone going has booked, else Planned.
create or replace function private.sync_own_status(p_item uuid) returns public.item_status
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.item_status;
  v_mode public.pay_mode;
  v_going int;
  v_booked int;
  v_lines int;
  v_new public.item_status;
begin
  select status, pay_mode into v_status, v_mode from public.items where id = p_item;
  if not found then return null; end if;
  if v_mode <> 'own' then return v_status; end if;
  select c.going, c.booked into v_going, v_booked from private.own_counts(p_item) c;
  select count(*) into v_lines from public.expenses where item_id = p_item and own;
  v_new := case
    when v_going > 0 and v_booked = v_going then 'confirmed'
    when v_lines > 0 then 'planned'
    else v_status
  end;
  -- updated_at is touched either way, so everyone's screen picks up a new booked mark.
  update public.items set status = v_new, updated_at = now() where id = p_item;
  return v_new;
end $$;
revoke execute on function private.sync_own_status(uuid) from public, anon, authenticated;
