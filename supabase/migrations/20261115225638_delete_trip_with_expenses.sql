-- Deleting a trip removes its expenses first. Without this, the cascade reaches the trip's
-- people while their expense shares still point at them, and the delete is refused.
-- (Removing just one person who paid or owes is still refused, on purpose.)
-- Runs as the table owner because only general expenses can be deleted directly; deleting the
-- trip itself is already limited to its owners by row-level security.
create function public.delete_trip_expenses() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.expenses where trip_id = old.id;
  return old;
end $$;
create trigger trips_delete_expenses before delete on public.trips
for each row execute function public.delete_trip_expenses();
revoke execute on function public.delete_trip_expenses() from public, anon, authenticated;
