import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));
import { feedbackPage } from "./feedback";

describe("the page a piece of feedback is sent from", () => {
  it("leaves out which trip it was", () => {
    expect(feedbackPage("/trips/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b")).toBe("/trips/:id");
    expect(feedbackPage("/trips/3F2A1B4C-5D6E-4F70-8A9B-0C1D2E3F4A5B/print")).toBe("/trips/:id/print");
  });

  it("leaves out an invite code, which would let someone into the trip", () => {
    expect(feedbackPage("/join/Zk3-secretCode_9")).toBe("/join/:code");
  });

  it("drops the query string and the hash", () => {
    expect(feedbackPage("/sign-in?next=/trips/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b#top")).toBe("/sign-in");
  });

  it("keeps ordinary pages as they are, and never more than 200 characters", () => {
    expect(feedbackPage("/you")).toBe("/you");
    expect(feedbackPage("/" + "a".repeat(400)).length).toBe(200);
  });
});
