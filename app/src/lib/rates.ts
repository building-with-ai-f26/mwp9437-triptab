/**
 * A price in another currency, in US dollars (C28, Mike's call 11/21): the European Central Bank's
 * daily reference rate, from Frankfurter (free, no account). Only the currency code is sent. The
 * converted cost is an estimate until whoever paid checks what their card was charged.
 */
export interface UsdRate {
  /** US dollars for one unit of the currency. */
  rate: number;
  /** The day the rate is for, "YYYY-MM-DD". */
  date: string;
}

const FRANKFURTER = "https://api.frankfurter.dev/v1/latest";
const cache = new Map<string, Promise<UsdRate | null>>();

/** Today's rate for a currency code ("EUR"), or null when it can't be had. */
export function usdRate(currency: string, fetcher: typeof fetch = fetch): Promise<UsdRate | null> {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return Promise.resolve(null);
  if (code === "USD") return Promise.resolve({ rate: 1, date: "" });
  let found = cache.get(code);
  if (!found) {
    found = fetcher(`${FRANKFURTER}?base=${code}&symbols=USD`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rates?: { USD?: unknown }; date?: unknown } | null) =>
        j && typeof j.rates?.USD === "number" && j.rates.USD > 0 ? { rate: j.rates.USD, date: String(j.date ?? "") } : null,
      )
      .catch(() => null);
    // A failed lookup isn't kept, so the next review tries again.
    found.then((r) => r ?? cache.delete(code));
    cache.set(code, found);
  }
  return found;
}

/** Cents in another currency, as US cents at a rate. */
export const toUsdCents = (cents: number, rate: number): number => Math.round(cents * rate);

/** "EUR 6,947.50" */
export const foreignLabel = (currency: string, cents: number): string =>
  `${currency} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The currencies offered next to a cost typed by hand (C33): the ones a group trip from the US most
 * often meets. Each is one the European Central Bank (and so Frankfurter) publishes a rate for.
 */
export const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "MXN", "JPY", "AUD", "SEK", "NOK", "DKK"] as const;

/** Forgets every rate (for tests). */
export const clearRates = () => cache.clear();
