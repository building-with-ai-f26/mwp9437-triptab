import { ClipboardPaste, PenLine, Wand2, type LucideIcon } from "lucide-react";
import { Dialog } from "../ui";

/** T9 (Mike's C59, 11/24): three ways to add a plan. "ideas" is Ask AI. */
export type AiChoice = "bookings" | "hand" | "ideas";

const CHOICES: { key: AiChoice; title: string; body: string; Icon: LucideIcon }[] = [
  {
    key: "bookings",
    title: "Import",
    body: "A confirmation email, a few lines, a PDF or a screenshot, or forward it to the trip's address. TripTab turns it into plans for you to check.",
    Icon: ClipboardPaste,
  },
  {
    key: "hand",
    title: "Add",
    body: "Type it in yourself: what, when, where and the cost.",
    Icon: PenLine,
  },
  {
    key: "ideas",
    title: "Ask AI",
    body: "Real places for the slots that are still empty, each with where it was found. They come in as Suggested.",
    Icon: Wand2,
  },
];

/**
 * The three ways to add a plan (T9, Mike's C59 on 11/24; it replaces the 11/18 one AI button with two
 * choices): Import, Add, Ask AI. On a phone the bottom bar's + opens this sheet; a laptop has the three
 * as buttons over the itinerary. Ask AI opens the ideas for empty slots while the Ask AI chat waits
 * (Mike, 11/24).
 */
export function AiChoiceDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (choice: AiChoice) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Add to the trip">
      {open && (
        <div className="space-y-2" data-testid="add-choices">
          {CHOICES.map(({ key, title, body, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              className="flex w-full items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 text-left text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/30">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg font-semibold">{title}</span>
                <span className="mt-0.5 block text-sm text-white/80">{body}</span>
              </span>
            </button>
          ))}
          <p className="pt-1 text-xs text-white/70">Nothing from Import or Ask AI is added until you review it. Each AI request costs TripTab a cent or two and is logged.</p>
        </div>
      )}
    </Dialog>
  );
}
