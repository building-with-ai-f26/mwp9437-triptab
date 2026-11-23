// The triptab Worker's bounces (app/worker/bounce.ts), C31: a refused sender is named, with the fix.
import { describe, expect, it } from "vitest";
import { bounceFor } from "../../worker/bounce";

describe("bounceFor", () => {
  it("names the address a refused email came from and how to fix it", () => {
    const text = bounceFor(403, { code: "not_on_trip", from: "mike.personal@gmail.com" })!;
    expect(text).toContain("This came from mike.personal@gmail.com");
    expect(text).toContain("isn't on this trip");
    expect(text).toContain("the email you sign in with");
    expect(text).toContain("or add mike.personal@gmail.com under Also forward from on your profile");
  });

  it("says when the sender couldn't be checked, not that they're off the trip", () => {
    const text = bounceFor(403, { code: "not_verified", from: "mike@stern.nyu.edu" })!;
    expect(text).toContain("This came from mike@stern.nyu.edu");
    expect(text).toContain("couldn't check");
    expect(text).not.toContain("isn't on this trip");
  });

  it("still bounces when the function gave no address", () => {
    expect(bounceFor(403, null)).toMatch(/^This came from an address, which isn't on this trip/);
    expect(bounceFor(403, { code: "not_on_trip", from: null })).toMatch(/^This came from an address,/);
  });

  it("keeps a mail server's reply plain: one line of ASCII, no long runs", () => {
    const text = bounceFor(403, { code: "not_on_trip", from: "évil\r\nX-Header: 1@x.com" })!;
    expect(text).toMatch(/^[\x20-\x7e]+$/);
    const long = bounceFor(403, { code: "not_on_trip", from: `${"a".repeat(300)}@x.com` })!;
    expect(long.length).toBeLessThan(400);
  });

  it("keeps the other bounces, and takes everything else", () => {
    expect(bounceFor(404, null)).toContain("no TripTab trip at that address");
    expect(bounceFor(413, null)).toContain("8 MB");
    expect(bounceFor(429, { code: "trip_capped" })).toContain("Try again tomorrow");
    expect(bounceFor(200, { code: "ok" })).toBeNull();
    expect(bounceFor(401, { code: "not_allowed" })).toBeNull();
  });
});
