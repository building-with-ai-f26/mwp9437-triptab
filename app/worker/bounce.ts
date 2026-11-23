// What the sender's mail program tells them when the triptab Worker can't take an email. Kept apart
// from index.ts so the unit tests read it (src/lib/bounce.test.ts) without loading the Worker.
//
// C31 (Mike's call, 11/21): two flight confirmations bounced with "Only people on the trip can send
// it bookings" and no hint why. They came from an address that wasn't on his account. The bounce now
// names the address the email came from (a bounce goes back only to that address) and how to fix it.

/** The answer inbox-email gives the Worker: why it refused, and for a refused sender, its address. */
export interface InboxAnswer {
  code?: unknown;
  from?: unknown;
}

const BY_STATUS: Record<number, string> = {
  404: "There's no TripTab trip at that address. Copy it again in the trip: AI help, then I have bookings.",
  413: "That email is too big for TripTab (8 MB at most).",
  429: "That trip has taken in all the emails it can today. Try again tomorrow, or add the booking in the app.",
};

/** A mail server's reply is plain ASCII on one line: anything else in an address is dropped. */
const plain = (s: unknown) =>
  String(s ?? "")
    .replace(/[^\x21-\x7e]/g, "")
    .slice(0, 100);

/** The bounce for the function's answer, or null when the email was taken. */
export function bounceFor(status: number, answer: InboxAnswer | null): string | null {
  if (status === 403) {
    const from = plain(answer?.from);
    const it = from ? `This came from ${from}` : "This came from an address";
    if (answer?.code === "not_verified") {
      return `${it}, but TripTab couldn't check it really came from there. Forward it again straight from your own mail app.`;
    }
    // Also forward from (C31): the address can be added to the account, confirmed by a code.
    const add = from ? `add ${from}` : "add it";
    return `${it}, which isn't on this trip in TripTab. Forward it from the email you sign in with, or ${add} under Also forward from on your profile.`;
  }
  return BY_STATUS[status] ?? null;
}
