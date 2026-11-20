/**
 * Email-in (Mike's call, 11/20): each trip's own address, trip+<code>@triptab.org, the way Wanderlog
 * gives each trip trips+<n>@wanderlog.com. The code comes from the database (inbox_address); the
 * Edge Function reads the same format (supabase/functions/inbox-email/rules.ts, checked by
 * inboxRules.test.ts).
 */
import type { Proposal } from "./importPlans";

export const INBOX_DOMAIN = "triptab.org";
export const inboxAddressFor = (code: string) => `trip+${code}@${INBOX_DOMAIN}`;

export type InboxStatus = "new" | "saved" | "dismissed" | "failed";

/** One email that came in: who sent it on the trip, its subject, and the plans import found. */
export interface InboxItem {
  id: string;
  trip_id: string;
  from_traveler: string | null;
  subject: string | null;
  received_at: string;
  status: InboxStatus;
  plans: Proposal[];
  note: string | null;
  call_id: string | null;
}
