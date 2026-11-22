/**
 * Email-in (Mike's call, 11/20): each trip's own address, trip+<code>@triptab.org, the way Wanderlog
 * gives each trip trips+<n>@wanderlog.com. The code comes from the database (inbox_address); the
 * Edge Function reads the same format (supabase/functions/inbox-email/rules.ts, checked by
 * inboxRules.test.ts).
 */
import type { Proposal } from "./importPlans";

export const INBOX_DOMAIN = "triptab.org";
export const inboxAddressFor = (code: string) => `trip+${code}@${INBOX_DOMAIN}`;

/** held: from an address nobody on the trip has, waiting unread for an Owner (C36, Mike's call 11/21). */
export type InboxStatus = "new" | "saved" | "dismissed" | "failed" | "held";

/** One email that came in: who sent it on the trip, its subject, and the plans import found. */
export interface InboxItem {
  id: string;
  trip_id: string;
  from_traveler: string | null;
  /** Who a held email came from (C36): an address nobody on the trip has. */
  from_address?: string | null;
  subject: string | null;
  received_at: string;
  status: InboxStatus;
  plans: Proposal[];
  note: string | null;
  call_id: string | null;
}
