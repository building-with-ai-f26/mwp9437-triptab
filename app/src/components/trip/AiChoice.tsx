import { ClipboardPaste, Wand2, type LucideIcon } from "lucide-react";
import { Dialog } from "../ui";

export type AiChoice = "bookings" | "ideas";

const CHOICES: { key: AiChoice; title: string; body: string; Icon: LucideIcon }[] = [
  {
    key: "bookings",
    title: "I have bookings",
    body: "Paste a confirmation email or a few lines, or add a PDF or screenshot. TripTab turns it into plans for you to check.",
    Icon: ClipboardPaste,
  },
  {
    key: "ideas",
    title: "Give me ideas",
    body: "Real places for the slots that are still empty, each with where it was found. They come in as Suggested.",
    Icon: Wand2,
  },
];

/**
 * The trip's one AI button (Mike's 11/18 call): two clear choices instead of two buttons. Under each,
 * the same Import and Plan with AI as before, with their own prompts, caps and evals.
 */
export function AiChoiceDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (choice: AiChoice) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="AI help">
      {open && (
        <div className="space-y-2">
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
          <p className="pt-1 text-xs text-white/70">Nothing is added until you review it. Each request costs TripTab a cent or two and is logged.</p>
        </div>
      )}
    </Dialog>
  );
}
