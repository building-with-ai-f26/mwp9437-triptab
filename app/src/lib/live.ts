/**
 * Live updates: listens for changes to one trip (plans, people, money, opt-ins, action items)
 * and calls onChange, at most once per 300 ms burst, so the trip page reloads itself when a friend
 * changes something. Supabase Realtime applies row-level security to inserts and updates;
 * deletes arrive for any row of the table (carrying only its id), which just triggers a reload.
 */
import { supabase } from "./supabase";

const BY_TRIP = ["items", "travelers", "stops", "expenses", "action_items"] as const;
const NO_TRIP_COLUMN = ["expense_shares", "item_people"] as const;

export function subscribeToTrip(tripId: string, onChange: () => void, opts: { payments?: boolean } = {}): () => void {
  let timer: number | undefined;
  const bump = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onChange, 300);
  };

  const channel = supabase.channel(`trip:${tripId}`);
  // Payments only where the database has them: subscribing to a missing table could break the channel.
  for (const table of opts.payments ? [...BY_TRIP, "payments" as const] : BY_TRIP) {
    const filter = `trip_id=eq.${tripId}`;
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table, filter }, bump);
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table, filter }, bump);
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table }, bump);
  }
  channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${tripId}` }, bump);
  for (const table of NO_TRIP_COLUMN) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, bump);
  }
  channel.subscribe();

  return () => {
    window.clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
