-- Feedback (Mike's call 11/23): a signed-in person reports a bug or asks for a feature from the
-- Help menu. TripTab keeps what they wrote, what kind it is, and which page they were on (with any
-- trip id or invite code taken out by the app before it's sent).
--
-- Who can do what: a signed-in person sends their own, at most 10 a day; nobody reads the table
-- from the app, the sender included. Mike reads it in Supabase. Deleting an account deletes its
-- feedback.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null constraint feedback_kind check (kind in ('bug', 'idea', 'other')),
  message text not null constraint feedback_message_length check (char_length(message) between 1 and 2000),
  page text constraint feedback_page_length check (page is null or char_length(page) <= 200),
  created_at timestamptz not null default now()
);
create index feedback_user_day on public.feedback (user_id, created_at);

alter table public.feedback enable row level security;
-- No policies: nothing reads or writes it from the browser. send_feedback is the only way in.
revoke all on public.feedback from anon, authenticated;

create function public.send_feedback(p_kind text, p_message text, p_page text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  msg text := btrim(coalesce(p_message, ''));
  today int;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if msg = '' then raise exception 'Write a few words first.' using errcode = '22023'; end if;
  if char_length(msg) > 2000 then raise exception 'That''s over 2,000 characters. Shorten it a little.' using errcode = '22023'; end if;
  if p_kind not in ('bug', 'idea', 'other') then raise exception 'Pick what kind of feedback this is.' using errcode = '22023'; end if;
  -- Counted here, in the database (AGENTS.md rule 11).
  select count(*) into today from public.feedback f where f.user_id = me and f.created_at > now() - interval '1 day';
  if today >= 10 then raise exception 'That''s 10 today, thank you. Send more tomorrow.' using errcode = '54000'; end if;
  insert into public.feedback (user_id, kind, message, page)
  values (me, p_kind, msg, nullif(left(btrim(coalesce(p_page, '')), 200), ''));
end $$;
revoke execute on function public.send_feedback(text, text, text) from public, anon;
grant execute on function public.send_feedback(text, text, text) to authenticated;
