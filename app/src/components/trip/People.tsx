import { useState } from "react";
import { Check, Copy, Link2, Mail, MessageSquare, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { Button, DarkField, Dialog, Segmented } from "../ui";
import { inviteUrl, type PersonDraft } from "../../lib/api";
import { ROLE_LABEL, type GroupLink, type Role, type Traveler, type Trip } from "../../lib/model";
import { track } from "../../lib/analytics";

const ROLE_OPTIONS = [
  { value: "owner" as Role, label: "Owner" },
  { value: "viewer" as Role, label: "Viewer" },
];

const ROLE_HELP: Record<Role, string> = {
  owner: "Owners add plans, costs and people, and can change roles.",
  viewer: "Viewers see the trip and opt in or out of plans.",
};

function inviteText(trip: Trip, url: string, name?: string) {
  return `${name ? `${name}, you're` : "You're"} on the ${trip.name} trip in TripTab. Tap to see the plan: ${url}`;
}

/** Copies text and briefly shows "Copied". */
function useCopy(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  return [
    copied,
    (key, text) => {
      navigator.clipboard?.writeText(text).catch(() => window.prompt("Copy this link:", text));
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    },
  ];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function PeopleCard({
  trip,
  travelers,
  link,
  meId,
  canEdit,
  onAdd,
  onRole,
  onRemove,
}: {
  trip: Trip;
  travelers: Traveler[];
  link: GroupLink | null;
  meId: string | null;
  canEdit: boolean;
  onAdd: () => void;
  onRole: (t: Traveler, role: Role) => Promise<void>;
  onRemove: (t: Traveler) => Promise<void>;
}) {
  const [copied, copy] = useCopy();
  const [error, setError] = useState<string | null>(null);
  const joined = travelers.filter((t) => t.user_id).length;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="glass-card-solid rounded-2xl p-4" aria-labelledby="people-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 id="people-title" className="font-display text-lg font-bold">
            People
          </h2>
          <p className="text-xs text-muted-foreground">
            {travelers.length} on the trip, {joined} joined
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={onAdd}>
            <UserPlus /> Add
          </Button>
        )}
      </div>

      <ul className="divide-y divide-foreground/10">
        {travelers.map((t) => {
          const me = t.id === meId;
          const url = link?.enabled ? inviteUrl(link.token, t.id) : null;
          return (
            <li key={t.id} className="py-2.5">
              <div className="flex items-center gap-2.5">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    t.user_id ? "bg-primary text-white" : "border border-dashed border-primary/50 text-primary"
                  }`}
                  aria-hidden
                >
                  {initials(t.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t.name} {me && <span className="font-normal text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.user_id ? (
                      <span className="inline-flex items-center gap-1 text-green-700">
                        <Check className="size-3" /> Joined
                      </span>
                    ) : (
                      "Not joined yet"
                    )}
                    {canEdit && (t.email || t.phone) ? ` · ${t.email ?? t.phone}` : ""}
                  </p>
                </div>
                {canEdit && !me ? (
                  <select
                    aria-label={`${t.name}'s role`}
                    className="h-9 rounded-full border border-white/50 bg-white/40 px-2.5 text-xs font-medium"
                    value={t.role}
                    onChange={(e) => run(() => onRole(t, e.target.value as Role))}
                  >
                    <option value="owner">Owner</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-gold-dark">
                    {ROLE_LABEL[t.role]}
                  </span>
                )}
              </div>
              {canEdit && !t.user_id && (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
                  {url ? (
                    <>
                      <button
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-white/50 bg-white/30 px-2.5 text-xs hover:bg-white/50"
                        onClick={() => {
                          copy(t.id, url);
                          track("group link copied", { kind: "personal" });
                        }}
                      >
                        {copied === t.id ? <Check className="size-3" /> : <Copy className="size-3" />}
                        {copied === t.id ? "Copied" : "Copy invite"}
                      </button>
                      <a
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-white/50 bg-white/30 px-2.5 text-xs hover:bg-white/50"
                        href={`sms:${t.phone ?? ""}?&body=${encodeURIComponent(inviteText(trip, url, t.name))}`}
                      >
                        <MessageSquare className="size-3" /> Text
                      </a>
                      {t.email && (
                        <a
                          className="inline-flex h-8 items-center gap-1 rounded-full border border-white/50 bg-white/30 px-2.5 text-xs hover:bg-white/50"
                          href={`mailto:${t.email}?subject=${encodeURIComponent(`${trip.name} on TripTab`)}&body=${encodeURIComponent(inviteText(trip, url, t.name))}`}
                        >
                          <Mail className="size-3" /> Email
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Turn the group link on to send invites.</span>
                  )}
                  <button
                    className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (window.confirm(`Take ${t.name} off the trip?`)) run(() => onRemove(t));
                    }}
                  >
                    <Trash2 className="size-3" /> Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

export function GroupLinkCard({
  trip,
  link,
  onChange,
  onReset,
}: {
  trip: Trip;
  link: GroupLink;
  onChange: (patch: Partial<Pick<GroupLink, "default_role" | "enabled">>) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [copied, copy] = useCopy();
  const [error, setError] = useState<string | null>(null);
  const url = inviteUrl(link.token);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="glass-card-solid rounded-2xl p-4" aria-labelledby="link-title">
      <h2 id="link-title" className="flex items-center gap-2 font-display text-lg font-bold">
        <Link2 className="size-4 text-primary" /> Group link
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Drop it in the group chat. People pick their name and they're on the trip.
      </p>

      {link.enabled ? (
        <>
          <div className="mb-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-white/40 px-3 py-2 text-xs">{url}</code>
            <Button
              size="sm"
              onClick={() => {
                copy("group", url);
                track("group link copied", { kind: "group" });
              }}
            >
              {copied === "group" ? <Check /> : <Copy />} {copied === "group" ? "Copied" : "Copy"}
            </Button>
          </div>
          <a
            href={`sms:?&body=${encodeURIComponent(inviteText(trip, url))}`}
            className="mb-3 inline-flex h-8 items-center gap-1 rounded-full border border-white/50 bg-white/30 px-3 text-xs hover:bg-white/50"
          >
            <MessageSquare className="size-3" /> Text it to the group
          </a>
        </>
      ) : (
        <p className="mb-3 rounded-xl bg-white/30 px-3 py-2 text-sm">The link is off. Nobody new can join with it.</p>
      )}

      <p className="label-luxury mb-1.5 text-muted-foreground">People who join with it are</p>
      <Segmented
        dark={false}
        label="Role for people who join with the link"
        value={link.default_role}
        onChange={(role) => run(() => onChange({ default_role: role }))}
        options={ROLE_OPTIONS}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">{ROLE_HELP[link.default_role]}</p>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-foreground/10 pt-3">
        <Button variant="glass" size="sm" onClick={() => run(() => onChange({ enabled: !link.enabled }))}>
          {link.enabled ? "Turn link off" : "Turn link on"}
        </Button>
        <Button
          variant="glass"
          size="sm"
          onClick={() => {
            if (window.confirm("Make a new link? The old one stops working; people already on the trip stay on it.")) {
              run(onReset);
            }
          }}
        >
          <RefreshCw /> New link
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/** Add someone directly by name, with email or phone, picking their role from an "Add as" menu. */
export function AddPersonDialog({
  open,
  defaultRole,
  onClose,
  onAdd,
}: {
  open: boolean;
  defaultRole: Role;
  onClose: () => void;
  onAdd: (p: PersonDraft) => Promise<void>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Add a person">
      {open && <AddPersonForm defaultRole={defaultRole} onClose={onClose} onAdd={onAdd} />}
    </Dialog>
  );
}

function AddPersonForm({
  defaultRole,
  onClose,
  onAdd,
}: {
  defaultRole: Role;
  onClose: () => void;
  onAdd: (p: PersonDraft) => Promise<void>;
}) {
  const [p, setP] = useState<PersonDraft>({ name: "", email: "", phone: "", role: defaultRole });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  const submit = async () => {
    if (!p.name.trim()) {
      setError("Add their name.");
      return;
    }
    if (p.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) {
      setError("That email doesn't look right.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(p);
      setAdded((a) => [...a, p.name.trim()]);
      setP({ name: "", email: "", phone: "", role: p.role });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="mb-4 text-sm text-white/70">
        They're on the trip right away, so you can put them on plans and costs before they ever open TripTab. Send them
        their invite from the People list.
      </p>
      {added.length > 0 && (
        <p className="mb-3 rounded-xl bg-green-500/15 px-3 py-2 text-sm text-green-200">
          Added {added.join(", ")}. Add another, or close.
        </p>
      )}
      <DarkField label="Name">
        <input className="field-dark" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} autoFocus />
      </DarkField>
      <div className="grid gap-x-2 sm:grid-cols-2">
        <DarkField label="Email (optional)">
          <input
            className="field-dark"
            type="email"
            inputMode="email"
            value={p.email}
            onChange={(e) => setP({ ...p, email: e.target.value })}
          />
        </DarkField>
        <DarkField label="Phone (optional)">
          <input
            className="field-dark"
            type="tel"
            inputMode="tel"
            value={p.phone}
            onChange={(e) => setP({ ...p, phone: e.target.value })}
          />
        </DarkField>
      </div>
      <DarkField group label="Add as" hint={ROLE_HELP[p.role]}>
        <Segmented label="Add as" value={p.role} onChange={(role) => setP({ ...p, role })} options={ROLE_OPTIONS} />
      </DarkField>
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="light" onClick={onClose}>
          {added.length ? "Done" : "Cancel"}
        </Button>
        <Button type="submit" disabled={busy}>
          <UserPlus /> {busy ? "Adding..." : "Add to trip"}
        </Button>
      </div>
    </form>
  );
}
