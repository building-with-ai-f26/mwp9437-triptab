/**
 * Place suggestions for a trip's stops (Build 3, the 11/17 pod feedback: "stops should autocomplete").
 * Open-Meteo's free geocoding search (GeoNames data, no key, CORS open), called from the browser
 * with only what was typed in the stop box. Bigger places first, so "Barc" gives Barcelona, Spain.
 * A suggestion is a help, never a gate: any typed name still works, and a failed lookup shows none.
 */
export interface Place {
  name: string;
  /** "Auvergne-Rhône-Alpes, France": what tells two places with one name apart. */
  detail: string;
}

interface Raw {
  name: string;
  admin1?: string;
  country?: string;
  population?: number;
}

const URL_BASE = "https://geocoding-api.open-meteo.com/v1/search";
export const PLACE_LIMIT = 6;

/** Biggest first, one row per name, region and country, at most PLACE_LIMIT. */
export function rankPlaces(results: Raw[] | undefined): Place[] {
  const seen = new Set<string>();
  return [...(results ?? [])]
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .map((r) => ({ name: r.name, detail: [r.admin1, r.country].filter(Boolean).join(", ") }))
    .filter((p) => {
      const key = `${p.name}|${p.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, PLACE_LIMIT);
}

export async function searchPlaces(text: string, signal?: AbortSignal): Promise<Place[]> {
  const q = text.trim();
  if (q.length < 2) return [];
  const res = await fetch(`${URL_BASE}?name=${encodeURIComponent(q)}&count=10&language=en&format=json`, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as { results?: Raw[] };
  return rankPlaces(body.results);
}
