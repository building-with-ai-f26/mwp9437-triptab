import { useEffect, useMemo, useState } from "react";
import type { CostType, Expense, Plan, Trip } from "./types";
import { calculateSettlements, formatCents, splitEqually, totalCents } from "./lib/money";
import { loadTrip, saveTrip } from "./lib/storage";
import "./App.css";

const newId = () => crypto.randomUUID();

/** Made-up sample so a demo can start in one click. */
function sampleTrip(): Trip {
  const travelers = ["Mike", "Alex", "Priya", "Sam"].map((name) => ({ id: newId(), name }));
  const plan = (title: string, when: string, estimate: number, costType: CostType): Plan => ({
    id: newId(),
    title,
    when,
    estimate,
    costType,
    status: "suggested",
  });
  return {
    name: "Sample: Lisbon long weekend",
    travelers,
    plans: [
      plan("Seafood dinner at the waterfront", "Fri 8 PM", 240, "total"),
      plan("Sintra day trip tickets", "Sat 9 AM", 35, "per_person"),
      plan("Sunset sailboat", "Sat 6 PM", 300, "total"),
    ],
    expenses: [],
  };
}

function SetupScreen({ onCreate }: { onCreate: (trip: Trip) => void }) {
  const [name, setName] = useState("");
  const [people, setPeople] = useState("");

  const names = people
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const canCreate = name.trim().length > 0 && names.length >= 2;

  return (
    <div className="setup card">
      <h2>Start a trip</h2>
      <label>
        Trip name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Austin bachelor weekend" />
      </label>
      <label>
        Who's going (comma-separated)
        <input value={people} onChange={(e) => setPeople(e.target.value)} placeholder="Mike, Alex, Priya, Sam" />
      </label>
      <div className="row">
        <button
          disabled={!canCreate}
          onClick={() =>
            onCreate({
              name: name.trim(),
              travelers: names.map((n) => ({ id: newId(), name: n })),
              plans: [],
              expenses: [],
            })
          }
        >
          Create trip
        </button>
        <button className="secondary" onClick={() => onCreate(sampleTrip())}>
          Load sample trip
        </button>
      </div>
      {!canCreate && <p className="hint">Add a name and at least two people.</p>}
    </div>
  );
}

function AddPlanForm({ onAdd }: { onAdd: (plan: Plan) => void }) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [estimate, setEstimate] = useState("");
  const [costType, setCostType] = useState<CostType>("total");

  const add = () => {
    if (!title.trim()) return;
    const cost = Number(estimate);
    onAdd({
      id: newId(),
      title: title.trim(),
      when: when.trim() || undefined,
      estimate: estimate && cost > 0 ? cost : undefined,
      costType,
      status: "suggested",
    });
    setTitle("");
    setWhen("");
    setEstimate("");
  };

  return (
    <div className="add-plan">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Suggest a plan, e.g. Boat day" />
      <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="When (optional)" />
      <input
        value={estimate}
        onChange={(e) => setEstimate(e.target.value)}
        placeholder="Est. $"
        inputMode="decimal"
      />
      <select value={costType} onChange={(e) => setCostType(e.target.value as CostType)}>
        <option value="total">total</option>
        <option value="per_person">per person</option>
      </select>
      <button onClick={add} disabled={!title.trim()}>
        Add
      </button>
    </div>
  );
}

function ConfirmPanel({
  plan,
  trip,
  onConfirm,
  onCancel,
}: {
  plan: Plan;
  trip: Trip;
  onConfirm: (expense: Expense) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(plan.estimate ? String(plan.estimate) : "");
  const [costType, setCostType] = useState<CostType>(plan.costType);
  const [paidBy, setPaidBy] = useState(trip.travelers[0]?.id ?? "");
  const [joined, setJoined] = useState<string[]>(trip.travelers.map((t) => t.id));

  const value = Number(amount);
  const valid = value > 0 && joined.length > 0 && paidBy !== "";
  const total = valid ? totalCents(value, costType, joined.length) : 0;

  const toggle = (id: string) =>
    setJoined((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="confirm card">
      <h3>Confirm: {plan.title}</h3>
      <div className="row">
        <label>
          Actual cost $
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
        </label>
        <label>
          Priced as
          <select value={costType} onChange={(e) => setCostType(e.target.value as CostType)}>
            <option value="total">total</option>
            <option value="per_person">per person</option>
          </select>
        </label>
        <label>
          Paid by
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {trip.travelers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Who joined</legend>
        {trip.travelers.map((t) => (
          <label key={t.id} className="check">
            <input type="checkbox" checked={joined.includes(t.id)} onChange={() => toggle(t.id)} />
            {t.name}
          </label>
        ))}
      </fieldset>
      <p className="hint">
        {valid
          ? `Logs ${formatCents(total)}, split ${joined.length} ways (${formatCents(Math.floor(total / joined.length))} each).`
          : "Enter a cost and pick at least one person."}
      </p>
      <div className="row">
        <button
          disabled={!valid}
          onClick={() =>
            onConfirm({
              id: newId(),
              planId: plan.id,
              description: plan.title,
              totalCents: total,
              paidBy,
              shares: splitEqually(total, joined),
              createdAt: new Date().toISOString(),
            })
          }
        >
          Confirm &amp; log expense
        </button>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [trip, setTrip] = useState<Trip | null>(() => loadTrip());
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => saveTrip(trip), [trip]);

  const nameOf = useMemo(() => {
    const map = new Map(trip?.travelers.map((t) => [t.id, t.name]));
    return (id: string) => map.get(id) ?? "?";
  }, [trip]);

  const settlement = useMemo(
    () => (trip ? calculateSettlements(trip.expenses, trip.travelers) : null),
    [trip],
  );

  if (!trip || !settlement) {
    return (
      <main>
        <Header />
        <SetupScreen onCreate={setTrip} />
      </main>
    );
  }

  const suggested = trip.plans.filter((p) => p.status === "suggested");
  const confirmed = trip.plans.filter((p) => p.status === "confirmed");
  const planToConfirm = trip.plans.find((p) => p.id === confirming);
  const spent = trip.expenses.reduce((s, e) => s + e.totalCents, 0);

  const confirmPlan = (expense: Expense) => {
    setTrip({
      ...trip,
      plans: trip.plans.map((p) =>
        p.id === expense.planId ? { ...p, status: "confirmed", expenseId: expense.id } : p,
      ),
      expenses: [...trip.expenses, expense],
    });
    setConfirming(null);
  };

  const undoConfirm = (plan: Plan) =>
    setTrip({
      ...trip,
      plans: trip.plans.map((p) => (p.id === plan.id ? { ...p, status: "suggested", expenseId: undefined } : p)),
      expenses: trip.expenses.filter((e) => e.id !== plan.expenseId),
    });

  const removePlan = (plan: Plan) => setTrip({ ...trip, plans: trip.plans.filter((p) => p.id !== plan.id) });

  return (
    <main>
      <Header />
      <section className="trip-head">
        <div>
          <h2>{trip.name}</h2>
          <p className="travelers">{trip.travelers.map((t) => t.name).join(" · ")}</p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            if (window.confirm("Start over? This clears the trip from this browser.")) setTrip(null);
          }}
        >
          New trip
        </button>
      </section>

      <div className="columns">
        <section className="card">
          <h3>1. Plans</h3>
          <AddPlanForm onAdd={(plan) => setTrip({ ...trip, plans: [...trip.plans, plan] })} />

          {planToConfirm && (
            <ConfirmPanel
              plan={planToConfirm}
              trip={trip}
              onConfirm={confirmPlan}
              onCancel={() => setConfirming(null)}
            />
          )}

          <h4>Suggested ({suggested.length})</h4>
          {suggested.length === 0 && <p className="hint">Nothing pending. Add an idea above.</p>}
          {suggested.map((p) => (
            <div key={p.id} className="plan suggested">
              <div>
                <strong>{p.title}</strong>
                <span className="meta">
                  {p.when ? ` · ${p.when}` : ""}
                  {p.estimate ? ` · ~$${p.estimate}${p.costType === "per_person" ? "/person" : ""}` : ""}
                </span>
              </div>
              <div className="row">
                <button onClick={() => setConfirming(p.id)}>Confirm</button>
                <button className="link" onClick={() => removePlan(p)}>
                  Remove
                </button>
              </div>
            </div>
          ))}

          <h4>Confirmed ({confirmed.length})</h4>
          {confirmed.map((p) => {
            const e = trip.expenses.find((x) => x.id === p.expenseId);
            return (
              <div key={p.id} className="plan confirmed">
                <div>
                  <strong>{p.title}</strong>
                  {e && (
                    <span className="meta">
                      {" "}
                      · {formatCents(e.totalCents)} paid by {nameOf(e.paidBy)} · split{" "}
                      {Object.keys(e.shares).length} ways
                    </span>
                  )}
                </div>
                <button className="link" onClick={() => undoConfirm(p)}>
                  Undo
                </button>
              </div>
            );
          })}
        </section>

        <section className="card">
          <h3>2. Settle up</h3>
          <p className="meta">Trip spend so far: {formatCents(spent)}</p>
          <table>
            <tbody>
              {trip.travelers.map((t) => {
                const b = settlement.balances[t.id] ?? 0;
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className={b > 0 ? "pos" : b < 0 ? "neg" : ""}>
                      {b > 0 ? `is owed ${formatCents(b)}` : b < 0 ? `owes ${formatCents(-b)}` : "even"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h4>Fewest payments to square up</h4>
          {settlement.transfers.length === 0 ? (
            <p className="hint">Everyone is even. Confirm a plan to log a cost.</p>
          ) : (
            <ol className="transfers">
              {settlement.transfers.map((t, i) => (
                <li key={i}>
                  <strong>{nameOf(t.from)}</strong> pays <strong>{nameOf(t.to)}</strong>{" "}
                  {formatCents(t.amountCents)}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="app-header">
      <h1>TripTab</h1>
      <p>Suggest it, confirm it, settle it. Confirming a plan logs the expense in the same step.</p>
    </header>
  );
}
