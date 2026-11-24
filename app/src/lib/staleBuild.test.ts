import { describe, expect, it } from "vitest";
import { isNewBuild, shouldReload } from "./staleBuild";

describe("reloading after a deploy", () => {
  it("reloads the first time a page file is missing", () => {
    expect(shouldReload(1_000_000, null)).toBe(true);
  });
  it("doesn't reload again within a minute, so a missing file can't loop", () => {
    expect(shouldReload(1_000_000, String(1_000_000 - 5_000))).toBe(false);
  });
  it("reloads again after a minute (the next deploy)", () => {
    expect(shouldReload(1_000_000, String(1_000_000 - 61_000))).toBe(true);
  });
  it("treats a damaged note as none", () => {
    expect(shouldReload(1_000_000, "abc")).toBe(true);
  });
});

describe("offering a reload when triptab.org has a newer build (C57)", () => {
  it("offers it when the live build is another one", () => {
    expect(isNewBuild("m3abc", { id: "m3abd" })).toBe(true);
  });
  it("stays quiet when this tab is the live build", () => {
    expect(isNewBuild("m3abc", { id: "m3abc" })).toBe(false);
  });
  it("treats anything it can't read as no news", () => {
    for (const live of [null, {}, { id: "" }, { id: 5 }, "m3abd", { id: "x".repeat(65) }]) expect(isNewBuild("m3abc", live)).toBe(false);
  });
});
