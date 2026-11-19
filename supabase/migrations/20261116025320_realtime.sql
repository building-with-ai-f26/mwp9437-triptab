-- Live updates: the trip's tables broadcast their changes, so a plan a friend adds shows up on
-- everyone's screen without a refresh. Supabase Realtime applies row-level security, so people
-- only hear about trips they're on.
alter publication supabase_realtime add table
  public.trips, public.stops, public.travelers, public.items,
  public.expenses, public.expense_shares, public.item_people, public.action_items;
