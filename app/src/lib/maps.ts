/**
 * T12 (the 11/24 pod test, clarified by Mike the same day): an AI idea's main link is a Google Maps
 * search for the place, built in code from its name and address. It needs no API key and costs
 * nothing; "Found on <site>" stays as the idea's source.
 */
export function mapsLink(name: string, address?: string | null): string {
  const n = name.trim();
  const a = address?.trim() ?? "";
  // An address that already starts with the name ("La Calèche, 18 Rue...") isn't repeated.
  const query = a && a.toLowerCase().startsWith(n.toLowerCase()) ? a : [n, a].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
