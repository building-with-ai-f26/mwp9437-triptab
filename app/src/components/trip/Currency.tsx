import { useEffect, useState } from "react";
import { CURRENCIES, usdRate, type UsdRate } from "../../lib/rates";

/**
 * A currency next to a cost typed by hand (C33, Mike's call 11/21): the amount stays as written, and
 * the split works in dollars at the day's rate, an estimate until whoever paid enters the card's
 * charge. Dark, for the plan and expense dialogs.
 */
export function CurrencySelect({ value, onChange, label = "Currency" }: { value: string; onChange: (c: string) => void; label?: string }) {
  return (
    <select className="field-dark w-24" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

/** Today's rate for a currency: undefined while it loads, null when it can't be had, 1 for dollars. */
export function useUsdRate(currency: string): UsdRate | null | undefined {
  const [rate, setRate] = useState<{ for: string; value: UsdRate | null } | null>(null);
  useEffect(() => {
    if (currency === "USD") return;
    let live = true;
    usdRate(currency).then((r) => live && setRate({ for: currency, value: r }));
    return () => {
      live = false;
    };
  }, [currency]);
  if (currency === "USD") return { rate: 1, date: "" };
  return rate?.for === currency ? rate.value : undefined;
}
