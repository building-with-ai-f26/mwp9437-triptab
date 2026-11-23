import { useState } from "react";
import { Check, Copy, MessageSquare, Share2, UserPlus, Users } from "lucide-react";
import { Button, Dialog } from "../ui";
import { inviteUrl } from "../../lib/api";
import { canShare, inviteText, useCopy } from "../../lib/invite";
import type { GroupLink, Trip } from "../../lib/model";
import { track } from "../../lib/analytics";

type From = "card" | "header";

/**
 * Invite the group (C46, Mike's call 11/23): after Start a trip nothing said "now invite people",
 * and the link sat under the 4th tab on a phone. The same three ways to send the group link, on a
 * card at the top of a trip while its owner is the only one on it, and behind a header button.
 */
function LinkActions({ trip, link, from, dark }: { trip: Trip; link: GroupLink; from: From; dark: boolean }) {
  const [copied, copy] = useCopy();
  const url = inviteUrl(link.token);
  const quiet = dark
    ? "border-white/15 bg-white/10 text-white hover:bg-white/20"
    : "border-foreground/15 bg-white/60 text-foreground hover:bg-white/80";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={() => {
          copy("group", url);
          track("group link copied", { kind: "group", from });
        }}
      >
        {copied === "group" ? <Check /> : <Copy />} {copied === "group" ? "Copied" : "Copy the link"}
      </Button>
      {canShare() && (
        <button
          type="button"
          className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${quiet}`}
          onClick={() => {
            track("group link shared", { from });
            navigator.share({ text: inviteText(trip, url) }).catch(() => undefined);
          }}
        >
          <Share2 className="size-4" /> Share
        </button>
      )}
      {/* ph-no-capture: the link's token stays out of PostHog's replays and clicks (analytics.ts). */}
      <a
        href={`sms:?&body=${encodeURIComponent(inviteText(trip, url))}`}
        className={`ph-no-capture inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${quiet}`}
        onClick={() => track("group link texted", { kind: "group", from })}
      >
        <MessageSquare className="size-4" /> Text it
      </a>
    </div>
  );
}

/** At the top of a trip while you're the only one on it. Gone as soon as a second person is. */
export function InviteCard({ trip, link, onAddPerson, onTurnOn }: { trip: Trip; link: GroupLink; onAddPerson: () => void; onTurnOn: () => Promise<void> }) {
  return (
    <section className="glass-card-solid mt-4 rounded-2xl p-4 sm:mt-6" aria-labelledby="invite-title" data-testid="invite-card">
      <h2 id="invite-title" className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
        <Users className="size-5 text-primary" /> Invite the group
      </h2>
      <p className="mb-3 mt-1 text-sm text-foreground/80">
        You're the only one here so far. Drop the link in your group chat: each person picks their name and they're on the trip.
      </p>
      {link.enabled ? <LinkActions trip={trip} link={link} from="card" dark={false} /> : <LinkOff onTurnOn={onTurnOn} dark={false} />}
      <button type="button" onClick={onAddPerson} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-4">
        <UserPlus className="size-4" /> Or add someone by name
      </button>
    </section>
  );
}

function LinkOff({ onTurnOn, dark }: { onTurnOn: () => Promise<void>; dark: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <p className={`mb-2 text-sm ${dark ? "text-white/80" : "text-foreground/80"}`}>The group link is off, so nobody new can join with it.</p>
      <Button onClick={() => onTurnOn().catch((e: Error) => setError(e.message))}>Turn the link on</Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

/** The header's Invite button opens this, on any trip you own. */
export function InviteDialog({
  open,
  onClose,
  trip,
  link,
  people,
  onAddPerson,
  onTurnOn,
}: {
  open: boolean;
  onClose: () => void;
  trip: Trip;
  link: GroupLink;
  people: number;
  onAddPerson: () => void;
  onTurnOn: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Invite the group">
      <p className="mb-4 text-sm text-white/80">
        Drop the link in your group chat: each person picks their name and they're on the trip.{" "}
        {people === 1 ? "You're the only one here so far." : `${people} people are on it so far.`}
      </p>
      {link.enabled ? <LinkActions trip={trip} link={link} from="header" dark /> : <LinkOff onTurnOn={onTurnOn} dark />}
      <button type="button" onClick={onAddPerson} className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-white underline underline-offset-4">
        <UserPlus className="size-4" /> Or add someone by name
      </button>
    </Dialog>
  );
}
