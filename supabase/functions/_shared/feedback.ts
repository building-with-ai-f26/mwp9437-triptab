// The email TripTab sends its builder when someone uses Send feedback (Mike's call, 11/23): so a
// report reaches him the same day, not when a session next reads the table. No imports but the
// email look, so the app's unit tests run this same file.
import { emailHtml } from "./email.ts";

/** Where feedback goes: the address Mike gave for TripTab. Overridden by FEEDBACK_TO if it's set. */
export const FEEDBACK_TO = "mwp9437@stern.nyu.edu";
/** Production's table of feedback, one click from the email. */
export const FEEDBACK_TABLE_URL = "https://supabase.com/dashboard/project/pptzbogslzicfyjooqra/editor";

export type FeedbackKind = "bug" | "idea" | "other";
const KIND_TITLE: Record<FeedbackKind, string> = { bug: "Something's broken", idea: "An idea or request", other: "Something else" };
const KIND_TAG: Record<FeedbackKind, string> = { bug: "Bug", idea: "Idea", other: "Feedback" };

/** One line, 60 characters at most: a name goes into a subject line. */
const oneLine = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

export function buildFeedbackEmail(p: { kind: FeedbackKind; message: string; page: string | null; name: string; email: string | null }) {
  const name = oneLine(p.name, 60) || "Someone";
  const first = oneLine(p.message, 60);
  const from = p.email ? `${name} (${p.email})` : name;
  // The message as they wrote it, a paragraph per blank line; everything is escaped by emailHtml.
  const paragraphs = p.message
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  return {
    subject: `${KIND_TAG[p.kind]} from ${name}: ${first}${p.message.trim().length > 60 ? "..." : ""}`,
    html: emailHtml({
      preview: first,
      label: "TripTab feedback",
      title: KIND_TITLE[p.kind],
      meta: `From ${from}${p.page ? ` · on ${p.page}` : ""}`,
      paragraphs,
      button: { text: "See all feedback", url: FEEDBACK_TABLE_URL },
      footnote: p.email ? `Reply to this email to answer ${name}.` : "They have no email on their account.",
    }),
    text: `${KIND_TITLE[p.kind]}\nFrom ${from}${p.page ? ` on ${p.page}` : ""}\n\n${p.message.trim()}\n\nAll feedback: ${FEEDBACK_TABLE_URL}`,
  };
}
