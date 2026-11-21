import { CURRENCIES } from "../../lib/rates";

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
