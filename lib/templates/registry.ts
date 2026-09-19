/**
 * Niche -> website template mapping.
 *
 * Add a template by adding an entry here and listing the niche keys
 * (`<primary tag>:<value>`) it covers, then run `npm run regroup` to re-match
 * businesses already in the database. Nothing is ever dropped for lacking a
 * template: unmatched niches fall through to `default`.
 */

export const DEFAULT_TEMPLATE_KEY = "default";

export type Template = {
  key: string;
  label: string;
  /** Niche keys this template covers. */
  niches: string[];
};

export const TEMPLATES: Template[] = [
  {
    key: "dentist",
    label: "Dentist",
    niches: ["healthcare:dentist", "amenity:dentist", "shop:dental_hygienist", "healthcare:orthodontist"],
  },
  {
    key: "coffee_shop",
    label: "Coffee shop",
    niches: ["amenity:cafe", "shop:coffee", "shop:tea"],
  },
  {
    key: "beauty_salon",
    label: "Beauty salon",
    niches: ["shop:beauty", "shop:hairdresser", "shop:nail_salon", "shop:massage", "shop:cosmetics"],
  },
  {
    key: DEFAULT_TEMPLATE_KEY,
    label: "Generic business",
    niches: [],
  },
];

const NICHE_TO_TEMPLATE: Map<string, string> = new Map(
  TEMPLATES.flatMap((template) => template.niches.map((niche) => [niche, template.key] as const)),
);

export function templateForNiche(nicheKey: string): string {
  return NICHE_TO_TEMPLATE.get(nicheKey) ?? DEFAULT_TEMPLATE_KEY;
}

export function templateLabel(key: string): string {
  return TEMPLATES.find((template) => template.key === key)?.label ?? key;
}
