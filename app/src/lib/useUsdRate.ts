import { useEffect, useState } from "react";
import { usdRate, type UsdRate } from "./rates";

/** Today's rate for a currency (C33), for the cost fields: undefined while it loads, null when it can't be had, 1 for dollars. */
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
