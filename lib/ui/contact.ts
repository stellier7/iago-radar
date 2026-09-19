/** Default country code for phone numbers tagged without one. */
const DEFAULT_COUNTRY_CODE = "504";

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * wa.me needs a bare international number. OSM phone tags in Honduras are
 * often local ("2234-5678"), so assume +504 when no country code is present.
 */
export function whatsappHref(phone: string | null, socials: Record<string, string>): string | null {
  if (socials.whatsapp) return socials.whatsapp;
  if (!phone) return null;

  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  const international = phone.trim().startsWith("+") ? digits : `${DEFAULT_COUNTRY_CODE}${digits}`;
  return `https://wa.me/${international}`;
}

/** Plain Google Maps search URL - no API key, no billing account. */
export function directionsHref(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

export function osmHref(osmType: string, osmId: number): string {
  return `https://www.openstreetmap.org/${osmType}/${osmId}`;
}

export function addressLine(business: {
  addrHousenumber: string | null;
  addrStreet: string | null;
}): string | null {
  const parts = [business.addrStreet, business.addrHousenumber].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}
