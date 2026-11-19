-- Expenses point at travelers with NO ACTION instead of RESTRICT: NO ACTION is checked at the
-- end of the statement, so deleting a whole trip (which cascades to its travelers and expenses
-- together) works, while removing just a person who paid or owes is still refused.
alter table public.expenses drop constraint expenses_paid_by_fkey,
  add constraint expenses_paid_by_fkey foreign key (paid_by) references public.travelers (id);
alter table public.expense_shares drop constraint expense_shares_traveler_id_fkey,
  add constraint expense_shares_traveler_id_fkey foreign key (traveler_id) references public.travelers (id);
