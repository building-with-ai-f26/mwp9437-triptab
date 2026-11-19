-- C17 (Mike's 11/19 call): a new token for every group link. Until 11/19's fix
-- (https://github.com/building-with-ai-f26/mwp9437-triptab/pull/47), each visit to a group link
-- sent its token to PostHog, and a link makes whoever joins through it an Owner by default, so
-- every token that existed then counts as known. Each trip gets a new one; anyone holding an old
-- link (or an invite email sent before this) gets the new one from People. It runs after the test
-- data is cleared (C18), so it touches only real trips.
update public.trip_links
set token = encode(extensions.gen_random_bytes(18), 'hex')
where token is not null;
