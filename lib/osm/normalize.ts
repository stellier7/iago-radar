import { classify, type OsmTags, type PrimaryTag } from "./categories";
import type { OverpassElement } from "./overpass";

export type NormalizedBusiness = {
  osmType: "node" | "way" | "relation";
  osmId: number;
  name: string | null;
  primaryTag: PrimaryTag;
  primaryValue: string;
  nicheKey: string;
  nicheLabel: string;
  lat: number | null;
  lon: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hasWebsite: boolean;
  openingHours: string | null;
  addrStreet: string | null;
  addrHousenumber: string | null;
  addrSuburb: string | null;
  addrNeighbourhood: string | null;
  addrCity: string | null;
  addrPostcode: string | null;
  socials: Record<string, string>;
  tags: OsmTags;
};

const NAME_KEYS = ["name", "name:es", "official_name", "alt_name", "brand", "operator"];
const PHONE_KEYS = ["phone", "contact:phone", "contact:mobile", "mobile", "telephone"];
const EMAIL_KEYS = ["email", "contact:email"];
const WEBSITE_KEYS = ["website", "contact:website", "url", "contact:url", "website:official"];

/**
 * A "website" tag pointing at one of these is a social profile, not a site.
 * Those businesses stay prospects - having a Facebook page is exactly the
 * profile we want to pitch.
 */
const SOCIAL_HOSTS: Record<string, string> = {
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "fb.me": "facebook",
  "m.facebook.com": "facebook",
  "web.facebook.com": "facebook",
  "instagram.com": "instagram",
  "wa.me": "whatsapp",
  "api.whatsapp.com": "whatsapp",
  "chat.whatsapp.com": "whatsapp",
  "twitter.com": "twitter",
  "x.com": "twitter",
  "tiktok.com": "tiktok",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "linkedin.com": "linkedin",
  "t.me": "telegram",
  "linktr.ee": "linktree",
  "linktree.com": "linktree",
};

const SOCIAL_TAGS: Record<string, string> = {
  facebook: "facebook",
  "contact:facebook": "facebook",
  instagram: "instagram",
  "contact:instagram": "instagram",
  whatsapp: "whatsapp",
  "contact:whatsapp": "whatsapp",
  twitter: "twitter",
  "contact:twitter": "twitter",
  tiktok: "tiktok",
  "contact:tiktok": "tiktok",
  youtube: "youtube",
  "contact:youtube": "youtube",
  linkedin: "linkedin",
  "contact:linkedin": "linkedin",
  telegram: "telegram",
  "contact:telegram": "telegram",
};

const EMPTY_VALUES = new Set(["", "no", "none", "n/a", "na", "-", "unknown", "yes"]);

function firstTag(tags: OsmTags, keys: readonly string[]): string | null {
  for (const key of keys) {
    const raw = tags[key];
    if (!raw) continue;
    // OSM allows "value1;value2"; take the first and keep it simple.
    const value = raw.split(";")[0]!.trim();
    if (!value || EMPTY_VALUES.has(value.toLowerCase())) continue;
    return value;
  }
  return null;
}

export function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || EMPTY_VALUES.has(trimmed.toLowerCase())) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function socialHostFor(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return SOCIAL_HOSTS[host] ?? null;
  } catch {
    return null;
  }
}

function collectSocials(tags: OsmTags): Record<string, string> {
  const socials: Record<string, string> = {};
  for (const [tagKey, network] of Object.entries(SOCIAL_TAGS)) {
    const raw = tags[tagKey];
    if (!raw) continue;
    const value = raw.split(";")[0]!.trim();
    if (!value || EMPTY_VALUES.has(value.toLowerCase())) continue;
    socials[network] ??= normalizeUrl(value) ?? value;
  }
  return socials;
}

function coordsOf(element: OverpassElement): { lat: number | null; lon: number | null } {
  if (typeof element.lat === "number" && typeof element.lon === "number") {
    return { lat: element.lat, lon: element.lon };
  }
  if (element.center) return { lat: element.center.lat, lon: element.center.lon };
  return { lat: null, lon: null };
}

/**
 * Turns one Overpass element into a storable business, or null when it is not a
 * business we track (see `classify`) or has no usable location.
 */
export function normalizeElement(element: OverpassElement): NormalizedBusiness | null {
  const tags = element.tags ?? {};
  const classification = classify(tags);
  if (!classification) return null;

  const { lat, lon } = coordsOf(element);
  // Without a coordinate we cannot place it in a zone, which makes it useless
  // for walk-in outreach.
  if (lat === null || lon === null) return null;

  const socials = collectSocials(tags);

  let website: string | null = null;
  const websiteTag = firstTag(tags, WEBSITE_KEYS);
  if (websiteTag) {
    const url = normalizeUrl(websiteTag);
    const network = url ? socialHostFor(url) : null;
    if (url && network) {
      socials[network] ??= url;
    } else {
      website = url;
    }
  }

  return {
    osmType: element.type,
    osmId: element.id,
    name: firstTag(tags, NAME_KEYS),
    primaryTag: classification.primaryTag,
    primaryValue: classification.primaryValue,
    nicheKey: classification.nicheKey,
    nicheLabel: classification.nicheLabel,
    lat,
    lon,
    phone: firstTag(tags, PHONE_KEYS),
    email: firstTag(tags, EMAIL_KEYS),
    website,
    hasWebsite: website !== null,
    openingHours: firstTag(tags, ["opening_hours"]),
    addrStreet: firstTag(tags, ["addr:street"]),
    addrHousenumber: firstTag(tags, ["addr:housenumber"]),
    addrSuburb: firstTag(tags, ["addr:suburb"]),
    addrNeighbourhood: firstTag(tags, ["addr:neighbourhood"]),
    addrCity: firstTag(tags, ["addr:city"]),
    addrPostcode: firstTag(tags, ["addr:postcode"]),
    socials,
    tags,
  };
}

/** Dedupes by OSM type+id, keeping the richest copy when a cell overlaps. */
export function dedupeByOsmId(businesses: NormalizedBusiness[]): NormalizedBusiness[] {
  const byKey = new Map<string, NormalizedBusiness>();
  for (const business of businesses) {
    const key = `${business.osmType}/${business.osmId}`;
    const existing = byKey.get(key);
    if (!existing || Object.keys(business.tags).length > Object.keys(existing.tags).length) {
      byKey.set(key, business);
    }
  }
  return [...byKey.values()];
}
