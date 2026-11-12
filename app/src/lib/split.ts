/**
 * How a cost is split, the way Splitwise does it: evenly by default, or by shares, percentages
 * or exact amounts. Everything is whole cents, and every split adds back to the total exactly.
 */
import { splitEqually } from "./money";

export type SplitMode = "even" | "shares" | "percent" | "exact";

export const SPLIT_LABEL: Record<SplitMode, string> = {
  even: "Evenly",
  shares: "By shares",
  percent: "By percent",
  exact: "Exact amounts",
};

/**
 * Splits `total` in proportion to `weights`. Cents left over after rounding down go to the
 * people with the biggest remainders (ties to the earliest in the list), so the parts always
 * add back to the total.
 */
export function splitByWeight(total: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const sum = ids.reduce((s, id) => s + weights[id], 0);
  const out: Record<string, number> = {};
  if (sum <= 0) return out;
  const raw = ids.map((id, i) => ({ id, i, exact: (total * weights[id]) / sum }));
  let given = 0;
  for (const r of raw) {
    out[r.id] = Math.floor(r.exact);
    given += out[r.id];
  }
  const order = [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || a.i - b.i);
  for (let k = 0; given < total; k++, given++) out[order[k % order.length].id] += 1;
  return out;
}

export interface SplitInput {
  mode: SplitMode;
  total: number;
  /** Who's in, in display order. */
  people: string[];
  /** shares: share count per person; percent: percent per person; exact: cents per person. */
  values?: Record<string, number>;
}

export interface SplitResult {
  shares: Record<string, number>;
  error: string | null;
}

/** Works out each person's part, or says what's wrong with the input. */
export function computeSplit({ mode, total, people, values = {} }: SplitInput): SplitResult {
  if (!Number.isInteger(total) || total < 0) return { shares: {}, error: "Enter the cost." };
  if (people.length === 0) return { shares: {}, error: "Pick at least one person." };

  if (mode === "even") return { shares: splitEqually(total, people), error: null };

  const v = (id: string) => (Number.isFinite(values[id]) ? values[id] : 0);

  if (mode === "shares") {
    if (people.some((id) => v(id) < 0)) return { shares: {}, error: "Shares can't be negative." };
    const weights = Object.fromEntries(people.map((id) => [id, v(id)]));
    if (people.every((id) => v(id) === 0)) return { shares: {}, error: "Give someone at least one share." };
    return { shares: fill(people, splitByWeight(total, weights)), error: null };
  }

  if (mode === "percent") {
    if (people.some((id) => v(id) < 0)) return { shares: {}, error: "Percentages can't be negative." };
    const sum = people.reduce((s, id) => s + v(id), 0);
    if (Math.abs(sum - 100) > 0.001) return { shares: {}, error: `Percentages add up to ${round(sum)}%, not 100%.` };
    const weights = Object.fromEntries(people.map((id) => [id, v(id)]));
    return { shares: fill(people, splitByWeight(total, weights)), error: null };
  }

  // exact
  if (people.some((id) => v(id) < 0 || !Number.isInteger(v(id)))) {
    return { shares: {}, error: "Amounts have to be positive dollars and cents." };
  }
  const sum = people.reduce((s, id) => s + v(id), 0);
  if (sum !== total) {
    const diff = total - sum;
    return {
      shares: {},
      error: `Amounts add up to $${(sum / 100).toFixed(2)}; ${diff > 0 ? `$${(diff / 100).toFixed(2)} left to assign` : `$${(-diff / 100).toFixed(2)} too much`}.`,
    };
  }
  return { shares: Object.fromEntries(people.map((id) => [id, v(id)])), error: null };
}

/** Everyone in the split gets an entry, even if their part is $0. */
function fill(people: string[], parts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(people.map((id) => [id, parts[id] ?? 0]));
}

const round = (n: number) => Math.round(n * 100) / 100;
