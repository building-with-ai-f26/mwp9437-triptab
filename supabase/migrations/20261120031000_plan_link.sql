-- C22 (Mike's call, 11/20, from his 11/19 review): a Link on every plan, such as an Airbnb listing
-- or a booking page. Owners set it with the rest of the plan; everyone on the trip sees it. Only a
-- web address (http or https) fits, so a link can't be a script or another kind of address.
alter table public.items
  add column link text constraint items_link_format check (
    link is null or (length(link) <= 500 and link ~* '^https?://[^[:space:]]+$')
  );

grant update (link) on public.items to authenticated;
