import { describe, expect, it } from "vitest";
import { shouldReload } from "./staleBuild";

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
