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
  const { error } = await c.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return c;
}
