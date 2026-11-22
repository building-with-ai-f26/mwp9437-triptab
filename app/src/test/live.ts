/** Shared helpers for the live database tests (*.live.test.ts, run with npm run test:rls). */
import { expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const url = import.meta.env.VITE_SUPABASE_URL!;
export const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
export const run = Math.random().toString(36).slice(2, 8);
const password = `pw-${run}-${Math.random().toString(36).slice(2)}`;

export const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** Makes a throwaway account (rls-<run>-<who>@example.com) through the sign-up function and signs in. */
export async function signedIn(who: string, name: string): Promise<SupabaseClient> {
  const email = `rls-${run}-${who}@example.com`;
  const res = await fetch(`${url}/functions/v1/sign-up`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  expect(res.status, `sign-up for ${who}`).toBe(200);
  const c = client();
  expect(await signIn(c, email)).toBeNull();
  return c;
}

/**
 * Signs in, waiting out TripTab dev's sign-in limit per address when it's reached (HTTP 429). On
 * 11/22 two production builds stopped here: Cloudflare's builds run from one address, so a pull
 * request's Preview and the merge's own build, minutes apart, made about 95 sign-ins in five
 * minutes, and dev refused three (GitHub's runner, on other addresses, never was). Each wait gives
 * the limit time to refill; every test still runs. Anything other than the limit fails at once.
 */
async function signIn(c: SupabaseClient, email: string) {
  for (let attempt = 1; ; attempt++) {
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (!error) return null;
    const limited = error.status === 429 || /rate limit/i.test(error.message);
    if (!limited || attempt === 4) return error;
    await new Promise((r) => setTimeout(r, 8_000 * attempt));
  }
}
