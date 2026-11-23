import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { BookOpen, CircleHelp, Compass, MessageSquarePlus, Send, ShieldCheck } from "lucide-react";
import { Button, DarkField, Dialog, Segmented } from "./ui";
import { FEEDBACK_MAX, sendFeedback, type FeedbackKind } from "../lib/feedback";
import { track } from "../lib/analytics";

/**
 * Help (Mike's call 11/23): the guide and feedback, one tap away on every signed-in page, long
 * after the first log-in. HelpButton sits in a page's header where there's room; HelpFooter is the
 * same three things as a line at the bottom of every page, phones included. On a trip, both also
 * start Show me around.
 */

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: "bug", label: "Something's broken" },
  { value: "idea", label: "An idea or request" },
  { value: "other", label: "Something else" },
];

const PROMPT: Record<FeedbackKind, string> = {
  bug: "What were you doing, and what happened instead?",
  idea: "What would you like TripTab to do?",
  other: "What's on your mind?",
};

/** The feedback form. Sends what you wrote, its kind and the page you're on, and nothing else. */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation();
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    onClose();
    // Sent: the next one starts fresh. Not sent: what you typed is still there if you reopen it.
    if (state === "sent") {
      setMessage("");
      setState("idle");
    }
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return setError("Write a few words first.");
    setState("sending");
    setError(null);
    try {
      await sendFeedback(kind, message, pathname);
      track("feedback sent", { kind, length: message.trim().length });
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Send feedback"
      footer={
        state === "sent" ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="glass" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form="feedback-form" disabled={state === "sending"}>
              <Send /> {state === "sending" ? "Sending..." : "Send"}
            </Button>
          </>
        )
      }
    >
      {state === "sent" ? (
        <div role="status" className="py-4 text-white" data-testid="feedback-thanks">
          <p className="font-display text-xl font-semibold">Thank you. It's been sent.</p>
          <p className="mt-2 text-sm text-white/80">It goes to the person who builds TripTab.</p>
        </div>
      ) : (
        <form id="feedback-form" onSubmit={submit} noValidate>
          <DarkField label="What kind?" group>
            <Segmented options={KINDS} value={kind} onChange={setKind} label="What kind of feedback" />
          </DarkField>
          <DarkField label="Tell us" hint={`${message.trim().length} of ${FEEDBACK_MAX.toLocaleString("en-US")} characters`}>
            <textarea
              className="field-dark min-h-[132px] resize-y"
              value={message}
              maxLength={FEEDBACK_MAX}
              placeholder={PROMPT[kind]}
              onChange={(e) => (setMessage(e.target.value), setError(null))}
            />
          </DarkField>
          <p className="text-xs text-white/70">
            TripTab keeps what you write here, with your account and which page you're on, and emails it to the person
            who builds TripTab, who may reply.
            Leave out anything private, like a password.
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
        </form>
      )}
    </Dialog>
  );
}

/** The Help menu's three or four choices, as a dialog. */
function HelpDialog({ open, onClose, onTour, onFeedback }: { open: boolean; onClose: () => void; onTour?: () => void; onFeedback: () => void }) {
  const row = "flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 text-left text-white hover:bg-white/10";
  const sub = "block text-xs font-normal text-white/70";
  return (
    <Dialog open={open} onClose={onClose} title="Help">
      <div className="space-y-2" data-testid="help-menu">
        {onTour && (
          <button
            type="button"
            className={row}
            onClick={() => {
              onClose();
              onTour();
            }}
          >
            <Compass className="size-5 shrink-0" />
            <span className="text-sm font-semibold">
              Show me around
              <span className={sub}>A one-minute tour of this trip</span>
            </span>
          </button>
        )}
        <Link to="/guide" className={row} onClick={() => track("guide opened", { from: "help" })}>
          <BookOpen className="size-5 shrink-0" />
          <span className="text-sm font-semibold">
            How TripTab works
            <span className={sub}>The guide: plans, money, your profile</span>
          </span>
        </Link>
        <button
          type="button"
          className={row}
          onClick={() => {
            onClose();
            onFeedback();
          }}
        >
          <MessageSquarePlus className="size-5 shrink-0" />
          <span className="text-sm font-semibold">
            Send feedback
            <span className={sub}>Report a bug or ask for a feature</span>
          </span>
        </button>
        <Link to="/privacy" className={row}>
          <ShieldCheck className="size-5 shrink-0" />
          <span className="text-sm font-semibold">
            Privacy
            <span className={sub}>What TripTab keeps and who sees it</span>
          </span>
        </Link>
      </div>
    </Dialog>
  );
}

/** Help's state for a page: one Help dialog and one feedback form, opened from the header or the footer. */
export function useHelp() {
  const [menu, setMenu] = useState(false);
  const [feedback, setFeedback] = useState(false);
  return {
    openMenu: () => (setMenu(true), track("help opened", {})),
    openFeedback: () => setFeedback(true),
    menu,
    feedback,
    closeMenu: () => setMenu(false),
    closeFeedback: () => setFeedback(false),
  };
}
export type HelpState = ReturnType<typeof useHelp>;

/** The header's Help button. `className` lets a crowded header show it only where there's room. */
export function HelpButton({ help, className = "" }: { help: HelpState; className?: string }) {
  return (
    <Button variant="glass" size="sm" aria-label="Help and feedback" title="Help and feedback" className={className} onClick={help.openMenu}>
      <CircleHelp /> <span className="hidden md:inline">Help</span>
    </Button>
  );
}

/**
 * The line at the bottom of a signed-in page, and the two dialogs it and the header button open.
 * `onTour` is given on a trip, where Show me around can run.
 */
export function HelpFooter({ help, onTour }: { help: HelpState; onTour?: () => void }) {
  const link = "inline-flex min-h-11 items-center px-1 font-semibold text-foreground underline underline-offset-4";
  return (
    <>
      <footer className="mx-auto max-w-4xl px-4 pb-6 pt-2 text-center text-sm text-foreground" data-testid="help-footer" data-tour="help">
        <div className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-2xl bg-[rgba(246,241,233,0.9)] px-4 py-1">
          {onTour && (
            <button type="button" className={link} onClick={onTour}>
              Show me around
            </button>
          )}
          <Link to="/guide" className={link} onClick={() => track("guide opened", { from: "footer" })}>
            Guide
          </Link>
          <button type="button" className={link} onClick={help.openFeedback}>
            Send feedback
          </button>
          <Link to="/privacy" className={link}>
            Privacy
          </Link>
        </div>
      </footer>
      <HelpDialog open={help.menu} onClose={help.closeMenu} onTour={onTour} onFeedback={help.openFeedback} />
      <FeedbackDialog open={help.feedback} onClose={help.closeFeedback} />
    </>
  );
}
