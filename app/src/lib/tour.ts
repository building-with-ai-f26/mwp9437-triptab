// Show me around: whether this device has seen the guide (src/components/trip/Tour.tsx).

/** Whether this device has seen the guide (or skipped it). The click-throughs set it, so it stays out of their way. */
export const TOUR_SEEN = "triptab.tour_seen";
export const tourSeen = (): boolean => {
  try {
    return localStorage.getItem(TOUR_SEEN) === "1";
  } catch {
    return true;
  }
};
export const markTourSeen = () => {
  try {
    localStorage.setItem(TOUR_SEEN, "1");
  } catch {
    /* private mode: it shows again next time, which is fine */
  }
};
