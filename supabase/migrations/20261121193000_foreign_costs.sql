-- A cost in another currency, typed by hand (C33, Mike's call 11/21): a currency next to Cost; the
-- amount kept as written (EUR 6,947.50), converted to dollars at the day's rate, and marked FX
-- pending until whoever paid enters what their card was charged, or keeps the estimate, before
-- settling up. C28's imported foreign prices are marked the same way.
--
-- The split and Settle up work in dollars, as before (total_cents and the shares); these columns
-- say the dollars are an estimate of a foreign amount. Expenses are still written only through
-- functions.
alter table public.expenses
  add column currency text check (currency ~ '^[A-Z]{3}$' and currency <> 'USD'),
  add column foreign_cents int check (foreign_cents between 0 and 100000000),
  add column fx_pending boolean not null default false;
alter table public.expenses
  add constraint expenses_foreign_pair check ((currency is null) = (foreign_cents is null)),
  add constraint expenses_pending_needs_currency check (not fx_pending or currency is not null);

-- An Owner marks an expense as priced in another currency, right after confirming the plan or
-- saving the expense in dollars at the day's rate: it's then an estimate, pending. A null currency
-- clears it (the cost was re-entered in dollars). Never on someone's own cost, which stays private.
create function public.set_expense_fx(p_expense uuid, p_currency text, p_foreign_cents int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
  v_own boolean;
begin
  select trip_id, own into v_trip, v_own from public.expenses where id = p_expense;
  if v_trip is null or not private.is_trip_owner(v_trip) then raise exception 'Only owners can do that' using errcode = '42501'; end if;
  if v_own then raise exception 'Your own costs stay in dollars' using errcode = '22023'; end if;
  if p_currency is null then
    update public.expenses set currency = null, foreign_cents = null, fx_pending = false where id = p_expense;
    return;
  end if;
  if upper(p_currency) !~ '^[A-Z]{3}$' or upper(p_currency) = 'USD' or p_foreign_cents is null or p_foreign_cents < 0 or p_foreign_cents > 100000000 then
    raise exception 'Pick a currency and the amount in it' using errcode = '22023';
  end if;
  update public.expenses set currency = upper(p_currency), foreign_cents = p_foreign_cents, fx_pending = true where id = p_expense;
end $$;

-- Whoever paid, or an Owner, settles a pending estimate: what the card charged in dollars, which
-- scales everyone's part to it (the cents left over go to the largest remainders, so the parts add
-- up exactly), or null to keep the estimate. Either way it's no longer pending.
create function public.settle_fx(p_expense uuid, p_total_cents int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.expenses;
begin
  select * into v from public.expenses where id = p_expense for update;
  if v.id is null or not (private.is_trip_owner(v.trip_id) or private.is_my_traveler(v.paid_by)) then
    raise exception 'Only whoever paid, or an owner, can do that' using errcode = '42501';
  end if;
  if not v.fx_pending then return; end if;
  if p_total_cents is not null then
    if p_total_cents < 0 or p_total_cents > 100000000 then raise exception 'Enter what the card charged' using errcode = '22023'; end if;
    with parts as (
      select traveler_id,
             case when v.total_cents = 0 then p_total_cents::numeric / count(*) over ()
                  else amount_cents::numeric * p_total_cents / v.total_cents end as exact
        from public.expense_shares where expense_id = p_expense
    ), ranked as (
      select traveler_id, floor(exact)::int as base,
             row_number() over (order by exact - floor(exact) desc, traveler_id) as rn,
             p_total_cents - sum(floor(exact)) over () as left_over
        from parts
    )
    update public.expense_shares s
       set amount_cents = r.base + case when r.rn <= r.left_over then 1 else 0 end
      from ranked r
     where s.expense_id = p_expense and s.traveler_id = r.traveler_id;
    update public.expenses set total_cents = p_total_cents where id = p_expense;
  end if;
  update public.expenses set fx_pending = false where id = p_expense;
end $$;

revoke execute on function public.set_expense_fx(uuid, text, int) from public, anon;
revoke execute on function public.settle_fx(uuid, int) from public, anon;
grant execute on function public.set_expense_fx(uuid, text, int) to authenticated;
grant execute on function public.settle_fx(uuid, int) to authenticated;
