// How people pay you (Mike's notes, 11/18): cleaning and checking a Venmo username and a Zelle
// phone or email, and showing them. No imports, so unit tests (pay.test.ts) run it as is. The
// database checks the same formats (supabase/migrations/20261119002546_pay_info.sql).

export const VENMO_FORMAT = "A Venmo username is 5 to 30 letters, numbers, - or _.";
/** "@Jordan-B" or " jordan-b " becomes "Jordan-B"; blank becomes null. */
export const cleanVenmo = (handle: string): string | null => handle.trim().replace(/^@/, "") || null;
export const venmoLooksRight = (handle: string): boolean => {
  const v = cleanVenmo(handle);
  return v === null || /^[A-Za-z0-9_-]{5,30}$/.test(v);
};

export const ZELLE_FORMAT = "For Zelle, use a US phone number (10 digits) or an email.";
/**
 * "Jordan@Mail.com " becomes "jordan@mail.com"; "+1 (555) 123-4567" becomes "5551234567"; blank
 * becomes null. The database does the same, so either side can clean it.
 */
export const cleanZelle = (value: string): string | null => {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("@")) return v;
  const digits = v.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};
export const zelleLooksRight = (value: string): boolean => {
  const z = cleanZelle(value);
  return z === null || (z.length <= 254 && (/^\d{10}$/.test(z) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(z)));
};
/** How a Zelle phone or email reads on screen: "(555) 123-4567" or the email. */
export const zelleLabel = (z: string): string =>
  /^\d{10}$/.test(z) ? `(${z.slice(0, 3)}) ${z.slice(3, 6)}-${z.slice(6)}` : z;
