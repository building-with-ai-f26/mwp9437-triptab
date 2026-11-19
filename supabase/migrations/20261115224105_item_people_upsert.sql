-- Opting in or out is an upsert, which rewrites the key columns too, so authenticated needs
-- update on the whole row. Row-level security still decides whose row it can be: your own,
-- or anyone's if you're an owner (private.can_set_going, checked on the new row).
grant update on public.item_people to authenticated;
