import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** True when app/.env.local has the Supabase URL and publishable key. */
export const isConfigured = Boolean(url && key);

/**
 * The one Supabase client. Both values are public (they ship in the browser); what a person
 * can read or change is decided by row-level security in the database, not by this key.
 */
export const supabase: SupabaseClient = createClient(url ?? "http://localhost:54321", key ?? "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true },
});
