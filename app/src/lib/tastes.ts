// The preferences survey on your profile (C51, Mike's call 11/23): short lists to tick, so AI
// suggestions fit the group. Stored as these lowercase words.
export const CUISINES = ["italian", "japanese", "mexican", "french", "indian", "thai", "chinese", "mediterranean", "american", "seafood", "vegetarian", "street food"] as const;
export const ACTIVITIES = ["skiing", "hiking", "beaches", "museums", "nightlife", "live music", "food tours", "shopping", "spa", "sightseeing", "road trips", "water sports"] as const;

/** "street food" shows as "Street food". */
export const tasteLabel = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** One person's shared picks as a line under their name: "Likes Italian, Japanese · skiing, hiking". */
export function tastesSummary(cuisines: string[], activities: string[]): string | null {
  const food = cuisines.map(tasteLabel).join(", ");
  const fun = activities.join(", ");
  if (!food && !fun) return null;
  return `Likes ${[food, fun].filter(Boolean).join(" · ")}`;
}
