import { describe, expect, it } from "vitest";
import { emailStillUnproven, wrongPasswordMessage } from "./signIn";

describe("a refused email and password", () => {
  it("points to Google when Google sign-in is on, with the same words for every email", () => {
    expect(wrongPasswordMessage(true)).toBe("That email and password don't match. If you've signed in with Google using this email, tap Continue with Google instead.");
  });
  it("says only that they don't match when Google sign-in is off", () => {
    expect(wrongPasswordMessage(false)).toBe("That email and password don't match.");
  });
});

describe("the confirm-your-email reminder", () => {
  const pending = { email: "Sam@Gmail.com", app_metadata: { email_check: "pending" } };
  it("shows while the email check is pending and nothing has proved the address", () => {
    expect(emailStillUnproven({ ...pending, identities: [{ provider: "email", identity_data: { email: "sam@gmail.com", email_verified: false } }] })).toBe(true);
    expect(emailStillUnproven(pending)).toBe(true);
  });
  it("stops once Google has vouched for the same address", () => {
    expect(emailStillUnproven({ ...pending, identities: [{ provider: "google", identity_data: { email: "sam@gmail.com", email_verified: true } }] })).toBe(false);
  });
  it("keeps showing when Google vouches for a different address, or hasn't verified it", () => {
    expect(emailStillUnproven({ ...pending, identities: [{ provider: "google", identity_data: { email: "other@gmail.com", email_verified: true } }] })).toBe(true);
    expect(emailStillUnproven({ ...pending, identities: [{ provider: "google", identity_data: { email: "sam@gmail.com", email_verified: false } }] })).toBe(true);
  });
  it("never shows once the link was opened, for an account with no flag, or signed out", () => {
    expect(emailStillUnproven({ email: "sam@gmail.com", app_metadata: { email_check: "confirmed" } })).toBe(false);
    expect(emailStillUnproven({ email: "sam@gmail.com", app_metadata: {} })).toBe(false);
    expect(emailStillUnproven(null)).toBe(false);
  });
});
