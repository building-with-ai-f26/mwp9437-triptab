import { useState } from "react";

/** The words that go with a trip's link in a text or a share sheet. */
export function inviteText(trip: { name: string }, url: string, name?: string): string {
  return `${name ? `${name}, you're` : "You're"} on the ${trip.name} trip in TripTab. Tap to see the plan: ${url}`;
}

/** Copies text and briefly shows "Copied". */
export function useCopy(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  return [
    copied,
    (key, text) => {
      navigator.clipboard?.writeText(text).catch(() => window.prompt("Copy this link:", text));
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    },
  ];
}

/** A phone's own share sheet (Messages, WhatsApp and the rest), where the browser has one. */
export const canShare = (): boolean => typeof navigator !== "undefined" && typeof navigator.share === "function";
