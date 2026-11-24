/**
 * The to-do list's filter and sort (T4, Mike's 11/23 ski trip test: "to-dos should filter and sort
 * by owner and date"). Pure functions, tested offline; the choice is remembered on the device.
 */
import type { ActionItem } from "./api";

/** Everyone (the default), Mine, Nobody yet, or one person by traveler id. */
export type TodoFilter = "everyone" | "mine" | "nobody" | `person:${string}`;
/** Due date (the default: soonest first, no date last), Owner, or Newest. */
export type TodoSort = "due" | "owner" | "newest";

export interface TodoView {
  filter: TodoFilter;
  sort: TodoSort;
}

export const DEFAULT_VIEW: TodoView = { filter: "everyone", sort: "due" };

type Todo = Pick<ActionItem, "assignee" | "due_day" | "created_at">;

export function filterTodos<T extends Todo>(todos: T[], filter: TodoFilter, meId: string | null): T[] {
  if (filter === "everyone") return todos;
  if (filter === "mine") return todos.filter((a) => meId != null && a.assignee === meId);
  if (filter === "nobody") return todos.filter((a) => a.assignee == null);
  const id = filter.slice("person:".length);
  return todos.filter((a) => a.assignee === id);
}

/** Soonest first; a to-do with no due date goes after every dated one. */
const byDue = (a: Todo, b: Todo) => (a.due_day ?? "9999-12-31").localeCompare(b.due_day ?? "9999-12-31");
const byOldest = (a: Todo, b: Todo) => a.created_at.localeCompare(b.created_at);

/**
 * - Due date: soonest first, no date last; equal dates by owner, then oldest first.
 * - Owner: by name, nobody's last; one person's by due date (no date last), then oldest first.
 * - Newest: the latest added first.
 */
export function sortTodos<T extends Todo>(todos: T[], sort: TodoSort, nameOf: (id: string | null) => string | null): T[] {
  const owner = (a: Todo, b: Todo) => {
    const x = nameOf(a.assignee);
    const y = nameOf(b.assignee);
    if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
    return x.localeCompare(y);
  };
  const out = [...todos];
  if (sort === "newest") return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (sort === "owner") return out.sort((a, b) => owner(a, b) || byDue(a, b) || byOldest(a, b));
  return out.sort((a, b) => byDue(a, b) || owner(a, b) || byOldest(a, b));
}

const KEY = "triptab.todo-view";

/** The view picked last on this device; the default when there's none or storage is blocked. */
export function loadView(): TodoView {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<TodoView> | null;
    const sort = saved?.sort === "owner" || saved?.sort === "newest" || saved?.sort === "due" ? saved.sort : DEFAULT_VIEW.sort;
    const f = saved?.filter;
    const filter = f === "everyone" || f === "mine" || f === "nobody" || (typeof f === "string" && f.startsWith("person:")) ? f : DEFAULT_VIEW.filter;
    return { filter, sort };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(view: TodoView): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    // Private windows and blocked storage: the choice just isn't remembered.
  }
}
