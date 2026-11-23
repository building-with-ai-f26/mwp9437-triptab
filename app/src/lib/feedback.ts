// Feedback (Mike's call 11/23): what a person sends from Help, and the page it's sent from.
import { supabase } from "./supabase";

export type FeedbackKind = "bug" | "idea" | "other";
export const FEEDBACK_MAX = 2000;

/**
 * The page a piece of feedback came from, with anything that identifies a trip or lets someone
 * into one taken out: trip ids and invite codes become ":id" and ":code", and the query string and
 * hash are dropped. "/trips/3f2a...-.../print" is sent as "/trips/:id/print".
 */
export function feedbackPage(pathname: string): string {
  return pathname
    .replace(/[?#].*$/, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/^(\/(?:join|confirm|reset)\/)[^/]+/i, "$1:code")
    .slice(0, 200);
}

/** Sends it. The server keeps at most 10 a person a day and says so in words a person can read. */
export async function sendFeedback(kind: FeedbackKind, message: string, pathname: string): Promise<void> {
  const text = message.trim();
  if (!text) throw new Error("Write a few words first.");
  if (text.length > FEEDBACK_MAX) throw new Error("That's over 2,000 characters. Shorten it a little.");
  const { error } = await supabase.rpc("send_feedback", { p_kind: kind, p_message: text, p_page: feedbackPage(pathname) });
  if (!error) return;
  // The function's own messages are written for people; anything else gets a plain one.
  if (error.code === "54000" || error.code === "22023") throw new Error(error.message);
  throw new Error("Couldn't send that. Try again in a moment.");
}
