/**
 * Which OSM tags make something "a local business we could sell a website to",
 * and how those tags become a niche.
 *
 * Everything in this file is meant to be tuned by hand as we learn what
 * Tegucigalpa's OSM data actually looks like. Widening a list means the next
 * crawl picks up more businesses; it never invalidates what is already stored.
 */

/**
 * Checked in order. The first key present on an element wins, so more specific
 * classifications (a dentist tagged both `healthcare=dentist` and
 * `amenity=dentist`) land on the better niche.
 */
export const PRIMARY_TAGS = ["healthcare", "shop", "craft", "office", "amenity", "tourism"] as const;

export type PrimaryTag = (typeof PRIMARY_TAGS)[number];

/**
 * `amenity` covers bus stops, benches and waste baskets, so it needs an
 * allowlist rather than a wildcard. These are the amenity values that behave
 * like a business with a storefront.
 */
export const AMENITY_ALLOWLIST = new Set([
  // Food and drink
  "cafe",
  "restaurant",
  "fast_food",
  "bar",
  "pub",
  "ice_cream",
  "food_court",
  "biergarten",
  // Health (still commonly tagged under amenity, not healthcare)
  "clinic",
  "dentist",
  "doctors",
  "pharmacy",
  "veterinary",
  // Money
  "bank",
  "bureau_de_change",
  // Vehicles
  "car_rental",
  "car_wash",
  "driving_school",
  "fuel",
  "motorcycle_rental",
  // Education and care
  "childcare",
  "kindergarten",
  "language_school",
  "music_school",
  "prep_school",
  // Other storefronts
  "casino",
  "cinema",
  "coworking_space",
  "events_venue",
  "funeral_hall",
  "internet_cafe",
  "marketplace",
  "nightclub",
  "photo_booth",
  "studio",
]);

/** Lodging only. The rest of `tourism` is attractions, viewpoints, artwork. */
export const TOURISM_ALLOWLIST = new Set([
  "hotel",
  "motel",
  "hostel",
  "guest_house",
  "apartment",
  "chalet",
  "resort",
]);

/**
 * Values that mean "there is no business here (any more)". `shop=vacant` in
 * particular is a mapped empty unit, not a prospect.
 */
export const DEAD_VALUES = new Set(["no", "vacant", "none", "abandoned", "disused", "closed"]);

/** Tag prefixes that mark an object as historical rather than operating. */
export const DEAD_PREFIXES = ["disused:", "abandoned:", "demolished:", "removed:", "was:"];

export type OsmTags = Record<string, string>;

export type Classification = {
  primaryTag: PrimaryTag;
  primaryValue: string;
  nicheKey: string;
  nicheLabel: string;
};

function isAllowedValue(tag: PrimaryTag, value: string): boolean {
  if (!value || DEAD_VALUES.has(value)) return false;
  if (tag === "amenity") return AMENITY_ALLOWLIST.has(value);
  if (tag === "tourism") return TOURISM_ALLOWLIST.has(value);
  return true;
}

export function humanizeValue(value: string): string {
  // OSM multi-values look like "hairdresser;beauty"; show the first one.
  const first = value.split(";")[0] ?? value;
  return first
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const PRIMARY_TAG_LABELS: Record<PrimaryTag, string> = {
  healthcare: "Health",
  shop: "Shop",
  craft: "Craft",
  office: "Office",
  amenity: "Amenity",
  tourism: "Lodging",
};

/**
 * The same trade is often tagged two ways - `amenity=pharmacy` and
 * `healthcare=pharmacy` both appear ~66 times in Tegucigalpa. Folding the
 * duplicates onto one niche key keeps the filter list and the template mapping
 * from splitting in half.
 */
const NICHE_ALIASES: Record<string, string> = {
  "amenity:pharmacy": "healthcare:pharmacy",
  "amenity:dentist": "healthcare:dentist",
  "amenity:doctors": "healthcare:doctor",
  "healthcare:doctors": "healthcare:doctor",
  "amenity:clinic": "healthcare:clinic",
  "amenity:veterinary": "healthcare:veterinary",
  "amenity:hospital": "healthcare:hospital",
};

/** `shop=yes` means "a shop, trade unspecified" - "Yes (Shop)" reads like a bug. */
const UNSPECIFIED_VALUES = new Set(["yes", "*"]);

export function nicheLabel(primaryTag: PrimaryTag, primaryValue: string): string {
  if (UNSPECIFIED_VALUES.has(primaryValue)) {
    return `Unspecified ${PRIMARY_TAG_LABELS[primaryTag].toLowerCase()}`;
  }
  return `${humanizeValue(primaryValue)} (${PRIMARY_TAG_LABELS[primaryTag]})`;
}

function canonicalize(primaryTag: PrimaryTag, primaryValue: string): Classification {
  const rawKey = `${primaryTag}:${primaryValue}`;
  const nicheKey = NICHE_ALIASES[rawKey] ?? rawKey;
  const [labelTag, labelValue] = nicheKey.split(":") as [PrimaryTag, string];

  return {
    primaryTag,
    primaryValue,
    nicheKey,
    nicheLabel: nicheLabel(labelTag, labelValue),
  };
}

/**
 * Picks the niche for a set of OSM tags, or null when the element is not a
 * business we care about (or is tagged as closed/disused).
 */
export function classify(tags: OsmTags): Classification | null {
  for (const key of Object.keys(tags)) {
    if (DEAD_PREFIXES.some((prefix) => key.startsWith(prefix))) return null;
  }

  for (const tag of PRIMARY_TAGS) {
    const raw = tags[tag];
    if (!raw) continue;
    const value = raw.split(";")[0]!.trim().toLowerCase();
    if (!isAllowedValue(tag, value)) continue;
    return canonicalize(tag, value);
  }

  return null;
}
