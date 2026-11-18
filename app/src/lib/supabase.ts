import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** True when app/.env.local has the Supabase URL and publishable key. */
export const isConfigured = Boolean(url && key);

/** The project's public address and key, for the few calls made without the client. */
export const supabaseUrl = url ?? "";
export const supabaseKey = key ?? "";

/**
 * True when this page load is the return from Google sign-in (it carries ?code=). Read before
 * the client swaps the code for a session and removes it from the address.
 */
export const arrivedFromOAuth = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code");

/**
 * The one Supabase client. Both values are public (they ship in the browser); what a person
 * can read or change is decided by row-level security in the database, not by this key.
 * Google sign-in uses PKCE: it comes back with a one-time code (exchanged here, in this browser),
 * never with a session token in the address bar.
 */
export const supabase: SupabaseClient = createClient(url ?? "http://localhost:54321", key ?? "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true, flowType: "pkce" },
});
