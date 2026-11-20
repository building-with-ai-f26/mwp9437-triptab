/**
 * Place suggestions (Build 3). Two free searches, each called from the browser with only what was
 * typed in that box, no key, CORS open. A suggestion is a help, never a gate: any typed text still
 * works, and a failed lookup shows none.
 *
 * - A trip's stops (the 11/17 pod feedback: "stops should autocomplete"): Open-Meteo's geocoding
 *   (GeoNames towns and cities). Bigger places first, so "Barc" gives Barcelona, Spain.
 * - A plan's Where (Mike's 11/19 review: "addresses autocomplete"): Photon, komoot's search over
 *   OpenStreetMap, which knows addresses and places (a ski area, a restaurant), leaning toward the
 *   stop the plan's day is at.
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
  latitude?: number;
  longitude?: number;
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

// ---------- A plan's Where: addresses and places (Photon) ----------

const PHOTON = "https://photon.komoot.io/api/";

export interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
  };
}

/** A place in the Where box: the line it fills in, and the line under it that tells two apart. */
export interface AddressPlace extends Place {
  /** What goes in the box when it's picked: "Loon Mountain Resort, Lincoln", "12 Rue du Lac, Annecy". */
  value: string;
}

/** Photon's answer as suggestions: a named place or a street address, with its town, one row each. */
export function toAddresses(features: PhotonFeature[] | undefined): AddressPlace[] {
  const seen = new Set<string>();
  const out: AddressPlace[] = [];
  for (const f of features ?? []) {
    const p = f.properties ?? {};
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const town = p.city ?? p.district;
    const name = p.name ?? (street || town);
    if (!name) continue;
    const detail = [p.name && street ? street : null, town !== name ? town : null, p.state, p.country].filter(Boolean).join(", ");
    const value = town && town !== name ? `${name}, ${town}` : name;
    const key = `${name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, detail, value });
    if (out.length === PLACE_LIMIT) break;
  }
  return out;
}

/** Where a stop is, from its name, once per name per visit (Open-Meteo), to lean Where's search toward it. */
const centers = new Map<string, Promise<{ lat: number; lon: number } | null>>();
export function stopCenter(name: string): Promise<{ lat: number; lon: number } | null> {
  const key = name.trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  if (!centers.has(key)) {
    centers.set(
      key,
      fetch(`${URL_BASE}?name=${encodeURIComponent(name.trim())}&count=1&language=en&format=json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { results?: Raw[] } | null) => {
          const r = b?.results?.[0];
          return r?.latitude != null && r.longitude != null ? { lat: r.latitude, lon: r.longitude } : null;
        })
        .catch(() => null),
    );
  }
  return centers.get(key)!;
}

/** Addresses and places for a plan's Where, leaning toward `near` (the stop's name) when given. */
export async function searchAddresses(text: string, near: string | null, signal?: AbortSignal): Promise<AddressPlace[]> {
  const q = text.trim();
  if (q.length < 3) return [];
  const at = near ? await stopCenter(near) : null;
  const bias = at ? `&lat=${at.lat}&lon=${at.lon}` : "";
  const res = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=10&lang=en${bias}`, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as { features?: PhotonFeature[] };
  return toAddresses(body.features);
}
