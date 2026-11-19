/**
 * Who's going, on a plan's card (Mike's 11/19 review: "are all 10 people on the trip going, or is
 * there just a group of 5?"). Initials (MP, JB) for a few, "+3" for the rest, or "Everyone" when
 * the whole group is in. No imports, so the unit tests run it as is.
 */

/** "Mike Pezza" is MP, "Vic" is V, "julia b." is JB. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]][0] ?? "";
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export interface GoingBadge {
  /** The whole group is in: one "Everyone" label instead of the faces. */
  everyone: boolean;
  /** Up to `max` people, you first. */
  shown: { id: string; initials: string; name: string }[];
  /** How many more are in beyond those shown. */
  more: number;
  /** "Mike, Julia and Vic", for the label a screen reader reads. */
  label: string;
}

/**
 * The badge for one plan, or null when there's nothing to say: a trip of one, or nobody in yet
 * (a flight no one's added themselves to).
 */
export function goingBadge(
  going: { id: string; name: string }[],
  groupSize: number,
  meId: string | null,
  max = 4,
): GoingBadge | null {
  if (groupSize < 2 || going.length === 0) return null;
  const ordered = [...going].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : 0));
  const names = ordered.map((p) => (p.id === meId ? "you" : p.name));
  const label =
    going.length >= groupSize
      ? "Everyone's in"
      : `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`} ${names.length === 1 && names[0] !== "you" ? "is" : "are"} in`;
  // Show max faces, or max - 1 and a "+N" when there are more, so the row never runs longer.
  const room = ordered.length > max ? max - 1 : max;
  return {
    everyone: going.length >= groupSize,
    shown: ordered.slice(0, room).map((p) => ({ id: p.id, initials: initials(p.name), name: p.id === meId ? "You" : p.name })),
    more: Math.max(0, ordered.length - room),
    label: label.charAt(0).toUpperCase() + label.slice(1),
  };
}
