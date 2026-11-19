import { describe, expect, it } from "vitest";
import type { CaptureResult } from "posthog-js";
import { scrubEvent, scrubLinks } from "./analytics";

// A group link's token is 36 hex characters (trip_links.token).
const TOKEN = "3f9c2a7be41d08c56a9e1f2b3c4d5e6f7a8b";

describe("group links never reach PostHog (security audit, 11/19)", () => {
  it("takes the token out of a page address, and keeps the rest", () => {
    expect(scrubLinks(`https://triptab.org/join/${TOKEN}`)).toBe("https://triptab.org/join/[link]");
    expect(scrubLinks(`https://triptab.org/join/${TOKEN}?as=8d1e&name=Sam`)).toBe("https://triptab.org/join/[link]?as=8d1e&name=Sam");
    expect(scrubLinks(`/join/${TOKEN}`)).toBe("/join/[link]");
    expect(scrubLinks("https://triptab.org/trips/new")).toBe("https://triptab.org/trips/new");
  });

  it("catches it URL-encoded too, as in a text-message link", () => {
    const sms = `sms:?&body=${encodeURIComponent(`You're on the Ski trip in TripTab: https://triptab.org/join/${TOKEN}`)}`;
    expect(sms).toContain(TOKEN);
    expect(scrubLinks(sms)).not.toContain(TOKEN);
    expect(scrubLinks(sms)).toContain("join%2F[link]");
  });

  it("scrubs every string an event carries, however deep, and leaves the rest alone", () => {
    const when = new Date("2026-11-19T16:00:00Z");
    const event = {
      uuid: "u1",
      event: "$autocapture",
      timestamp: when,
      properties: {
        $current_url: `https://triptab.org/join/${TOKEN}`,
        $pathname: `/join/${TOKEN}`,
        $elements: [{ tag_name: "a", attr__href: `sms:?&body=Tap%20https%3A%2F%2Ftriptab.org%2Fjoin%2F${TOKEN}` }],
        $snapshot_data: [{ type: 4, data: { href: `https://triptab.org/join/${TOKEN}`, width: 390 } }],
        count: 3,
        test_run: true,
      },
      $set_once: { $initial_current_url: `https://triptab.org/join/${TOKEN}` },
    } as unknown as CaptureResult;
    const out = scrubEvent(event)!;
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(out.properties.$pathname).toBe("/join/[link]");
    expect(out.properties.count).toBe(3);
    expect(out.properties.test_run).toBe(true);
    expect((out as unknown as { timestamp: Date }).timestamp).toBe(when);
    expect(scrubEvent(null)).toBeNull();
  });
});
