// Sends a "Confirm your email" link (Mike's 11/18 call, C6: use TripTab right away, with a reminder
// until you confirm). Used by sign-up, right after the account is made, and by confirm-email's
// Send it again. Only the token's hash is stored; the email address and the message are not.
// RESEND_API_KEY is an Edge Function secret, typed in by Mike; it never appears in a file or commit.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildConfirmEmail, confirmSendDecision, isReservedEmail, newToken, pickAppUrl, tokenHash, type EventRow } from "./account.ts";

export type SendResult = { sent: true } | { sent: false; reason: "reserved" | "not_set_up" | "error" | string; message?: string };

const FROM = "TripTab <no-reply@triptab.org>";

export async function sendConfirm(
  admin: SupabaseClient,
  user: { id: string; email: string; name: string },
  origin: string | null,
): Promise<SendResult> {
  if (isReservedEmail(user.email)) return { sent: false, reason: "reserved" };
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!apiKey) return { sent: false, reason: "not_set_up" };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: lastDay, error } = await admin.from("account_events").select("kind, user_id, ip_hash").eq("kind", "confirm_sent").gte("created_at", since);
  if (error) return { sent: false, reason: "error" };
  const refused = confirmSendDecision((lastDay ?? []) as EventRow[], user.id);
  if (refused) return { sent: false, reason: refused.code, message: refused.message };

  const token = newToken();
  const { error: saveError } = await admin
    .from("email_checks")
    .upsert({ user_id: user.id, token_hash: await tokenHash(token), sent_at: new Date().toISOString(), confirmed_at: null });
  if (saveError) return { sent: false, reason: "error" };

  const mail = buildConfirmEmail({ name: user.name || "there", url: `${pickAppUrl(origin)}/confirm-email?t=${token}` });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [user.email], ...mail }),
  });
  if (!res.ok) {
    console.error("resend error", res.status);
    return { sent: false, reason: "error" };
  }
  await admin.from("account_events").insert({ kind: "confirm_sent", user_id: user.id });
  return { sent: true };
}
