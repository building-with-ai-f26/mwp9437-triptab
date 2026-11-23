// A friend's first visit after joining by the group link (C45, Mike's call 11/23): straight to the
// trip, with no guide starting on its own and no "Confirm your email" reminder in the way.
import { markTourSeen } from "./tour";

/** The reminder is hidden for this visit when this is "1" in sessionStorage (ConfirmBanner). */
export const CONFIRM_BANNER_HIDDEN = "triptab.confirm_banner_hidden";

/**
 * Called as someone joins a trip. The guide stays one tap away (Show me around), and the reminder
 * is back on their next visit until they open the link in their email.
 */
export function quietFirstVisit(): void {
  markTourSeen();
  try {
    sessionStorage.setItem(CONFIRM_BANNER_HIDDEN, "1");
  } catch {
    // storage can be unavailable; then the reminder shows, which is fine
  }
}

/** Whether this device has already been asked how people pay you (Settle up asks once). */
const PAY_ASKED = "triptab.pay_asked";
export const payAsked = (): boolean => {
  try {
    return localStorage.getItem(PAY_ASKED) === "1";
  } catch {
    return true;
  }
};
export const markPayAsked = (): void => {
  try {
    localStorage.setItem(PAY_ASKED, "1");
  } catch {
    // it asks again next time, which is fine
  }
};
