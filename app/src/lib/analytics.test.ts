import { describe, expect, it } from "vitest";
import type { CaptureResult } from "posthog-js";
import { hidePersonal, scrubEvent, scrubLinks } from "./analytics";

// A group link's token is 36 hex characters (trip_links.token).
const TOKEN = "3f9c2a7be41d08c56a9e1f2b3c4d5e6f7a8b";

describe("group links never reach PostHog (security audit, 11/19)", () => {
  it("takes the token out of a page address, and keeps the rest", () => {
    expect(scrubLinks(`https://triptab.org/join/${TOKEN}`)).toBe("https://triptab.org/join/[link]");
    expect(scrubLinks(`https://triptab.org/join/${TOKEN}?as=8d1e&name=Sam`)).toBe("https://triptab.org/join/[link]?as=8d1e&name=[hidden]");
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

describe("one-time codes and typed names never reach PostHog (security audit, 11/22)", () => {
  const CODE = "2de13377-9a10-4c5e-8f00-1b2c3d4e5f60";
  const CONFIRM = "ab".repeat(32);

  it("hides the sign-in code Google sends back, wherever it lands", () => {
    expect(scrubLinks(`https://triptab.org/sign-in?code=${CODE}&next=%2Ftrips%2F08e4`)).toBe("https://triptab.org/sign-in?code=[hidden]&next=%2Ftrips%2F08e4");
    expect(scrubLinks(`https://triptab.org/trips?code=${CODE}&linked=google#`)).toBe("https://triptab.org/trips?code=[hidden]&linked=google#");
    expect(scrubLinks(`https://triptab.org/join/${TOKEN}?as=0556a741&code=${CODE}`)).toBe("https://triptab.org/join/[link]?as=0556a741&code=[hidden]");
  });

  it("hides the confirm-your-email and password-reset tokens", () => {
    expect(scrubLinks(`https://triptab.org/confirm-email?t=${CONFIRM}`)).toBe("https://triptab.org/confirm-email?t=[hidden]");
    expect(scrubLinks(`https://triptab.org/reset-password?token_hash=${CONFIRM}&type=recovery`)).toBe("https://triptab.org/reset-password?token_hash=[hidden]&type=recovery");
    expect(scrubLinks(`%3Ft%3D${CONFIRM}`)).toBe("%3Ft%3D[hidden]");
    expect(scrubLinks(`https://triptab.org/sign-in?next=%2Fjoin%2F${TOKEN}%3Fas%3D8d1e%26name%3DSam%20Lee`)).toBe("https://triptab.org/sign-in?next=%2Fjoin%2F[link]%3Fas%3D8d1e%26name%3D[hidden]");
    expect(scrubLinks("https://triptab.org/join/x?name=Sam%20Lee&as=1")).toBe("https://triptab.org/join/x?name=[hidden]&as=1");
  });

  it("leaves ordinary addresses and words alone", () => {
    for (const s of ["https://triptab.org/trips/08e463ab?tab=money", "https://triptab.org/sign-in?next=%2Ftrips", "the code=word in a sentence", "postcode=10012"]) {
      expect(scrubLinks(s)).toBe(s);
    }
  });

  it("scrubs a property's name as well as its value (heatmap data is filed under the page address)", () => {
    const event = {
      uuid: "u2",
      event: "$$heatmap",
      properties: {
        $heatmap_data: { [`https://triptab.org/join/${TOKEN}?code=${CODE}`]: [{ x: 10, y: 20, type: "click" }] },
        $current_url: `https://triptab.org/sign-in?code=${CODE}`,
      },
    } as unknown as CaptureResult;
    const out = JSON.stringify(scrubEvent(event));
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(CODE);
    expect(out).toContain("https://triptab.org/join/[link]?code=[hidden]");
    expect(out).toContain('"x":10');
  });
});

describe("emails and phone numbers never reach PostHog (security audit, 11/22)", () => {
  it("takes them out of on-screen text, and leaves dates, times and prices readable", () => {
    expect(hidePersonal("You're signed in as sam.lee+trips@gmail.com.")).toBe("You're signed in as [email].");
    expect(hidePersonal("Zelle (555) 123-4567")).toBe("Zelle [number]");
    expect(hidePersonal("Not joined yet · +1 212-555-0100")).toBe("Not joined yet · [number]");
    expect(hidePersonal("trip+3f9c2a7be41d08c5@triptab.org")).toBe("[email]");
    for (const s of ["Feb 5 to Feb 8, 2027", "2027-02-05", "Dinner at 8:30 PM, $1,234.50", "UA 57 departs 18:05", "Confirmation 48213907"]) {
      expect(hidePersonal(s)).toBe(s);
    }
  });

  it("takes them out of a clicked element's text and an email out of anything else", () => {
    const event = {
      uuid: "u3",
      event: "$autocapture",
      properties: {
        $elements: [{ tag_name: "button", $el_text: "Zelle (555) 123-4567" }, { tag_name: "a", $el_text: "Remove sam@example.com" }],
        $current_url: "https://triptab.org/trips?invite=sam%40example.com",
        $session_id: "01a1f55b-0ddd-7fc7-8b8a-a9cc5d8b1234",
        $lib_version: "1.447.12",
        $raw_user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2_1 like Mac OS X) AppleWebKit/605.1.15",
        sent: "1795333160878",
      },
    } as unknown as CaptureResult;
    const out = scrubEvent(event)!;
    const text = JSON.stringify(out);
    expect(text).not.toContain("555");
    expect(text).not.toContain("sam");
    expect(out.properties.$session_id).toBe("01a1f55b-0ddd-7fc7-8b8a-a9cc5d8b1234");
    expect(out.properties.$lib_version).toBe("1.447.12");
    expect(out.properties.sent).toBe("1795333160878");
    expect(String(out.properties.$raw_user_agent)).toContain("27_2_1");
  });
});

describe("errors are scrubbed like every other event (C48, 11/23)", () => {
  it("takes links, one-time codes, emails and phone numbers out of an error's message and stack", () => {
    const event = {
      uuid: "u2",
      event: "$exception",
      properties: {
        $current_url: `https://triptab.org/join/${TOKEN}?code=2de13377-9a10`,
        $exception_list: [
          {
            type: "Error",
            value: `Couldn't text sam@example.com at (917) 555-0142 the link https://triptab.org/join/${TOKEN}`,
            mechanism: { handled: false, synthetic: false },
            stacktrace: {
              type: "raw",
              frames: [
                { filename: "https://triptab.org/assets/index-B3x9.js", function: "join", lineno: 12, colno: 4040, in_app: true },
                { filename: `https://triptab.org/join/${TOKEN}`, function: "onClick", lineno: 1, colno: 1, in_app: true },
              ],
            },
          },
        ],
        where: "page",
      },
    } as unknown as CaptureResult;
    const out = JSON.stringify(scrubEvent(event));
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain("sam@example.com");
    expect(out).not.toContain("555-0142");
    expect(out).not.toContain("2de13377");
    expect(out).toContain("Couldn't text [email] at [number] the link https://triptab.org/join/[link]");
    // What makes the report useful stays: the error's type, the file and where in it.
    expect(out).toContain("index-B3x9.js");
    expect(out).toContain('"lineno":12');
    expect(out).toContain('"function":"onClick"');
  });

  it("leaves phone-like text alone in other events, as before", () => {
    const event = { uuid: "u3", event: "plan added", properties: { note: "ref 2027-02-06 4155550100" } } as unknown as CaptureResult;
    expect(scrubEvent(event)!.properties.note).toBe("ref 2027-02-06 4155550100");
  });
});
