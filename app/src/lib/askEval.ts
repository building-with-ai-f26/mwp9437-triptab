/**
 * Scoring for the Ask AI eval (T10): each case's options, checked by code against what the case
 * expects. No model grades a model here.
 * 1. shape:    the number of options asked for, each with a source, a price range and a description.
 * 2. place:    each in the right city, and of the kind asked for.
 * 3. fresh:    none repeats a plan already on the trip or an option already shown.
 * 4. moves:    a refinement's options move the way it asked (cheaper, higher end, another cuisine).
 * 5. booking:  the reservation flag is right on the obvious cases.
 */
export interface AskOption {
  kind: string;
  title: string;
  description: string;
  why: string;
  price_level: string | null;
  best_part: string;
  best_time: string | null;
  needs_reservation: boolean;
  location: string | null;
  source_url: string;
}

export interface AskEvalCase {
  id: string;
  group: "normal" | "refine" | "adversarial";
  what: string;
  request: string;
  refinements?: string[];
  /** Options already shown, as the app sends them: "Name ($$)". */
  shown?: string[];
  count?: number;
  expect: {
    count: number;
    city: string;
    kinds: string[];
    /** "cheaper" or "higher": the new options' average price level against the shown ones'. */
    direction?: "cheaper" | "higher";
    /** Words none of the new options may hold (another cuisine than the one shown). */
    not_words?: string[];
    /** Every option's reservation flag, on the obvious cases. */
    reservation?: boolean;
  };
}

export const ASK_RULES = ["shape", "place", "fresh", "moves", "booking"] as const;
export type AskRule = (typeof ASK_RULES)[number];
export const ASK_RULE_LABEL: Record<AskRule, string> = {
  shape: "Options asked for, sourced, priced, described",
  place: "Right city and kind",
  fresh: "No repeats of plans or shown options",
  moves: "Refinement moves the asked way",
  booking: "Reservation flag right",
};

export interface AskCaseScore {
  id: string;
  pass: Record<AskRule, boolean>;
  notes: string[];
}

const level = (p: string | null) => (p ? p.length : null);
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function scoreAskCase(c: AskEvalCase, options: AskOption[], planTitles: string[]): AskCaseScore {
  const notes: string[] = [];
  const pass: Record<AskRule, boolean> = { shape: true, place: true, fresh: true, moves: true, booking: true };
  const fail = (rule: AskRule, why: string) => {
    pass[rule] = false;
    notes.push(`${ASK_RULE_LABEL[rule]}: ${why}`);
  };

  if (options.length !== c.expect.count) fail("shape", `expected ${c.expect.count} options, got ${options.length}`);
  for (const o of options) {
    if (!o.source_url) fail("shape", `"${o.title}" has no source`);
    if (!o.price_level) fail("shape", `"${o.title}" has no price range`);
    if (!o.description.trim()) fail("shape", `"${o.title}" has no description`);
    const text = norm(`${o.title} ${o.location ?? ""} ${o.description} ${o.why} ${o.source_url}`);
    if (!text.includes(norm(c.expect.city))) fail("place", `"${o.title}" doesn't say ${c.expect.city}`);
    if (!c.expect.kinds.includes(o.kind)) fail("place", `"${o.title}" is a ${o.kind}, expected ${c.expect.kinds.join(" or ")}`);
  }

  const taken = [...planTitles, ...(c.shown ?? []).map((s) => s.replace(/\s*\(\${1,4}\)$/, ""))].map(norm);
  for (const o of options) {
    const n = norm(o.title);
    if (taken.some((t) => t === n || t.includes(n) || n.includes(t))) fail("fresh", `"${o.title}" repeats a plan or a shown option`);
  }

  if (c.expect.direction) {
    const before = (c.shown ?? []).map((s) => s.match(/\((\${1,4})\)$/)?.[1].length ?? 0).filter(Boolean);
    const after = options.map((o) => level(o.price_level)).filter((x): x is number => x != null);
    const moved = c.expect.direction === "cheaper" ? avg(after) < avg(before) : avg(after) > avg(before);
    if (!after.length || !moved) fail("moves", `price went ${avg(before).toFixed(1)} to ${avg(after).toFixed(1)}, expected ${c.expect.direction}`);
  }
  for (const w of c.expect.not_words ?? []) {
    const hit = options.find((o) => norm(`${o.title} ${o.description}`).includes(norm(w)));
    if (hit) fail("moves", `"${hit.title}" still says ${w}`);
  }

  if (c.expect.reservation !== undefined) {
    const wrong = options.filter((o) => o.needs_reservation !== c.expect.reservation);
    if (wrong.length) fail("booking", `${wrong.map((o) => o.title).join(", ")}: reservation ${!c.expect.reservation}, expected ${c.expect.reservation}`);
  }
  return { id: c.id, pass, notes };
}
