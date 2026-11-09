import type { Trip } from "../types";

const KEY = "triptab.v1";

/** Build 1 keeps everything in this browser's localStorage: no accounts, no server. */
export function loadTrip(): Trip | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Trip) : null;
  } catch {
    return null;
  }
}

export function saveTrip(trip: Trip | null): void {
  try {
    if (trip) localStorage.setItem(KEY, JSON.stringify(trip));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable (private mode); the app still works for this session.
  }
}
