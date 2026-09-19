/**
 * Nominatim's usage policy requires an identifying User-Agent, and Overpass
 * asks for one so operators can contact you about expensive queries.
 */
export function userAgent(): string {
  const contact = process.env.OSM_CONTACT?.trim();
  return contact ? `iago-radar/0.1 (${contact})` : "iago-radar/0.1 (contact unset; set OSM_CONTACT)";
}
