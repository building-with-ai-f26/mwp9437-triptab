/**
 * Email-in's rules (supabase/functions/inbox-email/rules.ts): which trip an address is for, who sent
 * it, and what part of a forwarded email goes to AI import. Made-up emails only.
 */
import { describe, expect, it } from "vitest";
import { accountEmails, dmarcPassed, htmlToText, importInput, inboxAddress, inboxToken, isOnTrip, maskedAddress, sameSecret, senderAddress } from "../../../supabase/functions/inbox-email/rules.ts";
import { inboxAddressFor } from "./inbox";

const TOKEN = "3f9a0b1c2d3e4f5a";

describe("which trip an address is for", () => {
  it("is trip+<code>@triptab.org, read back in any case, with or without angle brackets", () => {
    expect(inboxAddress(TOKEN)).toBe(`trip+${TOKEN}@triptab.org`);
    expect(inboxToken(`trip+${TOKEN}@triptab.org`)).toBe(TOKEN);
    expect(inboxToken(`<TRIP+${TOKEN.toUpperCase()}@TripTab.org>`)).toBe(TOKEN);
  });
  it("is the same address the app shows the Owner", () => {
    expect(inboxAddressFor(TOKEN)).toBe(inboxAddress(TOKEN));
    expect(inboxToken(inboxAddressFor(TOKEN))).toBe(TOKEN);
  });
  it("refuses anything that isn't a trip's code", () => {
    expect(inboxToken("trip@triptab.org")).toBeNull();
    expect(inboxToken(`hello+${TOKEN}@triptab.org`)).toBeNull();
    expect(inboxToken(`trip+${TOKEN}0@triptab.org`)).toBeNull();
    expect(inboxToken(null)).toBeNull();
  });
});

describe("who sent it", () => {
  it("takes the bare address from a From header", () => {
    expect(senderAddress('"Mike P" <Mike@Example.com>')).toBe("mike@example.com");
    expect(senderAddress("vic@example.com")).toBe("vic@example.com");
    expect(senderAddress("no address here")).toBeNull();
  });
  it("counts only someone whose address is on the trip", () => {
    expect(isOnTrip("mike@example.com", ["Mike@example.com ", null])).toBe(true);
    expect(isOnTrip("stranger@example.com", ["mike@example.com"])).toBe(false);
    expect(isOnTrip(null, ["mike@example.com"])).toBe(false);
  });
});

describe("a refused sender in the logs (C31)", () => {
  it("keeps the first letter and the domain, never the whole address", () => {
    expect(maskedAddress("mike.personal@gmail.com")).toBe("m***@gmail.com");
    expect(maskedAddress("x@stern.nyu.edu")).toBe("x***@stern.nyu.edu");
    expect(maskedAddress(null)).toBe("(none)");
    expect(maskedAddress("not an address")).toBe("(none)");
  });
});

describe("what goes to import", () => {
  it("turns an HTML confirmation into readable lines", () => {
    const text = htmlToText(
      '<html><head><style>p{color:red}</style></head><body><p>Hertz&nbsp;reservation</p><table><tr><td>Pick up</td><td>Nov 24, 2:00&nbsp;PM</td></tr></table><script>alert(1)</script></body></html>',
    );
    expect(text).toBe("Hertz reservation\nPick up Nov 24, 2:00 PM");
  });

  it("uses the text part, with the subject on top, and the PDF over a photo", () => {
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const png = new Uint8Array([137, 80, 78, 71]);
    const r = importInput({
      subject: "Fwd: Your car rental",
      text: "Confirmation HZ123, pick up Nov 24.",
      attachments: [
        { mimeType: "image/png", content: png },
        { mimeType: "application/pdf", content: pdf },
      ],
    })!;
    expect(r.text).toBe("Subject: Fwd: Your car rental\n\nConfirmation HZ123, pick up Nov 24.");
    expect(r.file).toEqual({ media_type: "application/pdf", data: "JVBERg==" });
  });

  it("falls back to the HTML, skips files import can't read or that are too big, and returns null for an empty email", () => {
    const big = new Uint8Array(3_000_001);
    const r = importInput({ html: "<p>Booked: Loon Mountain lift tickets</p>", attachments: [{ mimeType: "application/zip", content: new Uint8Array([1]) }, { mimeType: "application/pdf", content: big }] })!;
    expect(r.text).toBe("Booked: Loon Mountain lift tickets");
    expect(r.file).toBeNull();
    expect(importInput({ subject: "", text: "  " })).toBeNull();
  });
});

describe("the Worker's secret", () => {
  it("matches only the same value", () => {
    expect(sameSecret("abc123", "abc123")).toBe(true);
    expect(sameSecret("abc123", "abc124")).toBe(false);
    expect(sameSecret("", "")).toBe(false);
  });
});

describe("whether the sender is who the email says (Cloudflare's own check)", () => {
  it("passes when Cloudflare's header, the first one, says DMARC passed", () => {
    expect(dmarcPassed("mx.cloudflare.net; spf=pass smtp.mailfrom=gmail.com; dkim=pass header.d=gmail.com; dmarc=pass header.from=gmail.com")).toBe(true);
    expect(dmarcPassed("MX.Cloudflare.net;dmarc=pass header.from=nyu.edu")).toBe(true);
  });
  it("fails when DMARC failed, was missing, or the header isn't Cloudflare's", () => {
    expect(dmarcPassed("mx.cloudflare.net; spf=pass smtp.mailfrom=x.com; dkim=none; dmarc=fail header.from=gmail.com")).toBe(false);
    expect(dmarcPassed("mx.cloudflare.net; spf=pass smtp.mailfrom=x.com; dkim=pass header.d=x.com; dmarc=none header.from=x.com")).toBe(false);
    expect(dmarcPassed("evil.example; dmarc=pass header.from=gmail.com")).toBe(false);
    expect(dmarcPassed("")).toBe(false);
    expect(dmarcPassed(null)).toBe(false);
  });
  it("reads only Cloudflare's header, never one the sender added after it", () => {
    // Headers.get joins repeats with ", ": Cloudflare's comes first.
    expect(dmarcPassed("mx.cloudflare.net; dmarc=fail header.from=gmail.com, mx.cloudflare.net; dmarc=pass header.from=gmail.com")).toBe(false);
    expect(dmarcPassed("mx.cloudflare.net; dmarc=fail header.from=gmail.com (dmarc=pass)")).toBe(false);
  });
  it("isn't thrown by a comment with a comma in it", () => {
    expect(
      dmarcPassed(
        "mx.cloudflare.net; spf=pass (mx.cloudflare.net: domain of a@gmail.com designates 209.85.1.2 as permitted sender, (checked)) smtp.mailfrom=a@gmail.com; dkim=pass header.d=gmail.com; dmarc=pass header.from=gmail.com",
      ),
    ).toBe(true);
    expect(dmarcPassed("mx.cloudflare.net; spf=fail (a, b); dmarc=fail header.from=x.com, mx.cloudflare.net; dmarc=pass")).toBe(false);
  });
});

describe("the addresses an account signs in with (C19)", () => {
  it("are its email and each linked sign-in's, once each, in lower case", () => {
    const user = {
      email: "Mike.Alias@example.edu",
      identities: [
        { identity_data: { email: "mike.alias@example.edu" } },
        { identity_data: { email: "netid@example.edu" } },
        { identity_data: null },
        { identity_data: { email: 42 } },
      ],
    };
    expect(accountEmails(user)).toEqual(["mike.alias@example.edu", "netid@example.edu"]);
    expect(isOnTrip("netid@example.edu", accountEmails(user))).toBe(true);
  });
  it("are none for no account", () => {
    expect(accountEmails(null)).toEqual([]);
    expect(accountEmails({ email: null })).toEqual([]);
  });
});

describe("an email can't stop its own reading (security audit, 11/22)", () => {
  it("a numbered character no text can hold becomes a space instead of an error", () => {
    expect(htmlToText("<p>Flight AA100 &#99999999; Feb 6 &#233;</p>")).toBe("Flight AA100 Feb 6 é");
  });
});
