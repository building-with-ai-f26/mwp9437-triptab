-- Security audit, 11/19: a to-do with no one assigned could be ticked off by anyone signed in, on
-- any trip, as long as they had its id. The check "an owner, or the person it's assigned to" came
-- out NULL rather than false when nobody was assigned (NULL = auth.uid() is NULL), and plpgsql's IF
-- treats NULL as not true, so the refusal never ran. Found by app/e2e/rls-proof.cjs; covered by
-- app/src/actions.live.test.ts. Same rule, with the NULL handled, and strangers told it's gone.
create or replace function public.set_action_done(p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select ai.trip_id, t.user_id as assignee_user into a
  from public.action_items ai left join public.travelers t on t.id = ai.assignee
  where ai.id = p_id;
  if not found or not private.is_trip_member(a.trip_id) then
    raise exception 'That item is gone' using errcode = 'P0002';
  end if;
  if not (private.is_trip_owner(a.trip_id) or coalesce(a.assignee_user = auth.uid(), false)) then
    raise exception 'Only owners or the person it''s assigned to can do that' using errcode = '42501';
  end if;
  update public.action_items set done = p_done where id = p_id;
end $$;
revoke execute on function public.set_action_done(uuid, boolean) from public, anon;
grant execute on function public.set_action_done(uuid, boolean) to authenticated;
