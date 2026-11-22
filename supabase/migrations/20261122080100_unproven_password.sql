-- Security audit, 11/22 (SECURITY.md): an account made with someone else's email (attack 9).
--
-- The sign-up function lets a new account in right away (Mike's 11/18 call, C6), so it marks the
-- email confirmed for Supabase before anyone has proved the address is theirs; TripTab's own
-- "confirm your email" flag (app_metadata.email_check = 'pending') only drives a reminder. Supabase
-- links a Google sign-in to an existing account with the same email, and it drops that account's
-- password only when its email is unconfirmed. So someone could sign up with another person's Gmail
-- address and a password of their own, wait for that person to tap Continue with Google, and still
-- get in with the password afterwards.
--
-- This does what Supabase would have done had the email been left unconfirmed: when a sign-in
-- provider that vouches for the very same address is linked to an account whose email TripTab is
-- still waiting on, the password, every other sign-in method and every session made before that
-- moment go, and so do forwarding addresses added by whoever held the password. Google proved who
-- owns the address; nothing before it did. An account that has opened its confirmation link, or
-- that links a Google account with a different address, is left alone.
--
-- It never stops a sign-in: if anything in it fails, the sign-in goes ahead and a warning is logged.
create function private.drop_unproven_password() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.provider <> 'email'
     and new.identity_data->>'email_verified' = 'true'
     and exists (
       select 1 from auth.users u
        where u.id = new.user_id
          and u.raw_app_meta_data->>'email_check' = 'pending'
          and lower(u.email) = lower(new.identity_data->>'email')
     ) then
    update auth.users set encrypted_password = null where id = new.user_id;
    delete from auth.sessions where user_id = new.user_id;
    delete from auth.identities where user_id = new.user_id and id <> new.id;
    delete from public.forward_addresses where user_id = new.user_id;
  end if;
  return new;
exception when others then
  raise warning 'drop_unproven_password: %', sqlerrm;
  return new;
end $$;
revoke execute on function private.drop_unproven_password() from public, anon, authenticated;

create trigger identities_drop_unproven_password after insert on auth.identities
for each row execute function private.drop_unproven_password();
