import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRates, foreignLabel, toUsdCents, usdRate } from "./rates";

const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

describe("a foreign price in dollars (C28)", () => {
  beforeEach(() => clearRates());
  it("asks Frankfurter for the day's rate, sending only the currency", async () => {
    const f = answer({ amount: 1, base: "EUR", date: "2026-11-20", rates: { USD: 1.099 } });
    expect(await usdRate("eur", f)).toEqual({ rate: 1.099, date: "2026-11-20" });
    expect(f).toHaveBeenCalledWith("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD");
  });
  it("asks once per currency", async () => {
    const f = answer({ date: "2026-11-20", rates: { USD: 1.3125 } });
    await usdRate("GBP", f);
    await usdRate("GBP", f);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("is null when the rate can't be had, and asks again next time", async () => {
    const down = answer({}, false);
    expect(await usdRate("CHF", down)).toBeNull();
    const up = answer({ date: "2026-11-20", rates: { USD: 1.13 } });
    expect(await usdRate("CHF", up)).toEqual({ rate: 1.13, date: "2026-11-20" });
  });
  it("never asks for a code that isn't one", async () => {
    const f = answer({});
    expect(await usdRate("euros", f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(await usdRate("USD", f)).toEqual({ rate: 1, date: "" });
  });
  it("converts cents and labels the original", () => {
    expect(toUsdCents(694750, 1.099)).toBe(763530);
    expect(foreignLabel("EUR", 694750)).toBe("EUR 6,947.50");
  });
});
