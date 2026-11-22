/**
 * Two small rules about signing in, kept apart from auth.tsx so they can be tested.
 *
 * Background (security audit, 11/22, finding D): an account made with an email and a password works
 * right away, before anyone has proved the email is theirs. If Google later vouches for that very
 * address, the database drops the password, because nothing showed that whoever typed it owns the
 * address. From then on the account signs in with Google (or sets a new password by email).
 */

/** What the sign-in form says when the email and password are refused. */
export function wrongPasswordMessage(googleEnabled: boolean): string {
  const base = "That email and password don't match.";
  // The hint is the same for every email, so it never tells anyone whether an account exists.
  return googleEnabled ? `${base} If you've signed in with Google using this email, tap Continue with Google instead.` : base;
}

type Identity = { provider?: string; identity_data?: { email?: unknown; email_verified?: unknown } | null };
type AccountLike = { email?: string | null; app_metadata?: Record<string, unknown> | null; identities?: Identity[] | null };

/**
 * Whether to keep reminding someone to confirm their email. Not once they've opened the link, and
 * not once a sign-in provider such as Google has vouched for the same address: that proves it too.
 */
export function emailStillUnproven(user: AccountLike | null | undefined): boolean {
  if (user?.app_metadata?.email_check !== "pending") return false;
  const mine = (user.email ?? "").trim().toLowerCase();
  const vouched = (user.identities ?? []).some(
    (i) => i.provider !== "email" && i.identity_data?.email_verified === true && String(i.identity_data?.email ?? "").trim().toLowerCase() === mine,
  );
  return !vouched;
}
