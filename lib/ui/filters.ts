import type { SortKey, WebsiteFilter } from "../repo/businesses";

/** Generous page size: grouping by zone only reads well with a whole zone on screen. */
export const PAGE_SIZE = 250;

export type FilterState = {
  citySlug: string;
  zoneIds: number[];
  includeNoZone: boolean;
  nicheKeys: string[];
  templateKeys: string[];
  website: WebsiteFilter;
  search: string | null;
  namedOnly: boolean;
  sort: SortKey;
  grouped: boolean;
  page: number;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

const WEBSITE_VALUES: WebsiteFilter[] = ["all", "missing", "present"];
const SORT_VALUES: SortKey[] = ["name", "niche", "recent"];

function single(params: RawSearchParams, key: string): string | null {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ? raw.trim() : null;
}

function list(params: RawSearchParams, key: string): string[] {
  const value = params[key];
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseFilters(params: RawSearchParams): FilterState {
  const zoneValues = list(params, "zone");
  const website = single(params, "web");
  const sort = single(params, "sort");

  return {
    citySlug: single(params, "city") ?? "tegucigalpa",
    zoneIds: zoneValues.filter((v) => /^\d+$/.test(v)).map(Number),
    includeNoZone: zoneValues.includes("none"),
    nicheKeys: list(params, "niche"),
    templateKeys: list(params, "tpl"),
    // Prospects are the point of the tool, so that is the landing view.
    website: WEBSITE_VALUES.includes(website as WebsiteFilter) ? (website as WebsiteFilter) : "missing",
    search: single(params, "q"),
    namedOnly: single(params, "named") === "1",
    sort: SORT_VALUES.includes(sort as SortKey) ? (sort as SortKey) : "name",
    grouped: single(params, "group") !== "flat",
    page: Math.max(1, Number(single(params, "page") ?? 1) || 1),
  };
}

/** Serialises state back to a query string, omitting anything at its default. */
export function toQueryString(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.citySlug !== "tegucigalpa") params.set("city", state.citySlug);

  const zoneValues = [...state.zoneIds.map(String), ...(state.includeNoZone ? ["none"] : [])];
  if (zoneValues.length > 0) params.set("zone", zoneValues.join(","));
  if (state.nicheKeys.length > 0) params.set("niche", state.nicheKeys.join(","));
  if (state.templateKeys.length > 0) params.set("tpl", state.templateKeys.join(","));
  if (state.website !== "missing") params.set("web", state.website);
  if (state.search) params.set("q", state.search);
  if (state.namedOnly) params.set("named", "1");
  if (state.sort !== "name") params.set("sort", state.sort);
  if (!state.grouped) params.set("group", "flat");
  if (state.page > 1) params.set("page", String(state.page));

  return params.toString();
}
