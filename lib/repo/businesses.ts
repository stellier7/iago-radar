import { query, type Queryable } from "../db";
import type { NormalizedBusiness } from "../osm/normalize";
import { templateForNiche } from "../templates/registry";

export type BusinessRecord = {
  id: number;
  osmType: string;
  osmId: number;
  name: string | null;
  primaryTag: string;
  primaryValue: string;
  nicheKey: string;
  nicheLabel: string;
  templateKey: string;
  zoneId: number | null;
  zoneName: string | null;
  zoneSource: string | null;
  lat: number | null;
  lon: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hasWebsite: boolean;
  openingHours: string | null;
  addrStreet: string | null;
  addrHousenumber: string | null;
  socials: Record<string, string>;
  lastSeenAt: string;
};

type BusinessRow = {
  id: string;
  osm_type: string;
  osm_id: string;
  name: string | null;
  primary_tag: string;
  primary_value: string;
  niche_key: string;
  niche_label: string;
  template_key: string;
  zone_id: number | null;
  zone_name: string | null;
  zone_source: string | null;
  lat: number | null;
  lon: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  has_website: boolean;
  opening_hours: string | null;
  addr_street: string | null;
  addr_housenumber: string | null;
  socials: Record<string, string>;
  last_seen_at: Date;
};

function toRecord(row: BusinessRow): BusinessRecord {
  return {
    id: Number(row.id),
    osmType: row.osm_type,
    osmId: Number(row.osm_id),
    name: row.name,
    primaryTag: row.primary_tag,
    primaryValue: row.primary_value,
    nicheKey: row.niche_key,
    nicheLabel: row.niche_label,
    templateKey: row.template_key,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    zoneSource: row.zone_source,
    lat: row.lat,
    lon: row.lon,
    phone: row.phone,
    email: row.email,
    website: row.website,
    hasWebsite: row.has_website,
    openingHours: row.opening_hours,
    addrStreet: row.addr_street,
    addrHousenumber: row.addr_housenumber,
    socials: row.socials ?? {},
    lastSeenAt: row.last_seen_at.toISOString(),
  };
}

const UPSERT_COLUMNS = [
  "city_id",
  "osm_type",
  "osm_id",
  "name",
  "primary_tag",
  "primary_value",
  "niche_key",
  "niche_label",
  "template_key",
  "zone_id",
  "lat",
  "lon",
  "phone",
  "email",
  "website",
  "has_website",
  "opening_hours",
  "addr_street",
  "addr_housenumber",
  "addr_suburb",
  "addr_neighbourhood",
  "addr_city",
  "addr_postcode",
  "socials",
  "tags",
] as const;

/** Rows per multi-row INSERT. 25 columns x 200 rows stays well under the 65535 parameter ceiling. */
const UPSERT_CHUNK_SIZE = 200;

export type BusinessWithZone = NormalizedBusiness & { zoneId: number };

/**
 * Inserts or refreshes businesses, deduplicated by OSM type + id. Re-running a
 * crawl over the same area updates tags in place and bumps last_seen_at.
 */
export async function upsertBusinesses(db: Queryable, cityId: number, rows: BusinessWithZone[]): Promise<number> {
  let written = 0;

  for (let start = 0; start < rows.length; start += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + UPSERT_CHUNK_SIZE);
    const params: unknown[] = [];
    const tuples = chunk.map((business) => {
      const values = [
        cityId,
        business.osmType,
        business.osmId,
        business.name,
        business.primaryTag,
        business.primaryValue,
        business.nicheKey,
        business.nicheLabel,
        templateForNiche(business.nicheKey),
        business.zoneId,
        business.lat,
        business.lon,
        business.phone,
        business.email,
        business.website,
        business.hasWebsite,
        business.openingHours,
        business.addrStreet,
        business.addrHousenumber,
        business.addrSuburb,
        business.addrNeighbourhood,
        business.addrCity,
        business.addrPostcode,
        JSON.stringify(business.socials),
        JSON.stringify(business.tags),
      ];
      const placeholders = values.map((_, i) => `$${params.length + i + 1}`);
      params.push(...values);
      return `(${placeholders.join(", ")})`;
    });

    const updates = UPSERT_COLUMNS.filter((column) => column !== "osm_type" && column !== "osm_id")
      .map((column) => `${column} = excluded.${column}`)
      .join(",\n        ");

    const result = await db.query(
      `
      insert into businesses (${UPSERT_COLUMNS.join(", ")})
      values ${tuples.join(", ")}
      on conflict (osm_type, osm_id) do update set
        ${updates},
        last_seen_at = now(),
        updated_at = now()
      `,
      params,
    );
    written += result.rowCount ?? 0;
  }

  return written;
}

export type WebsiteFilter = "all" | "missing" | "present";
export type SortKey = "name" | "niche" | "recent";

export type BusinessFilters = {
  cityId: number;
  zoneIds: number[];
  includeNoZone: boolean;
  nicheKeys: string[];
  templateKeys: string[];
  website: WebsiteFilter;
  search: string | null;
  namedOnly: boolean;
  sort: SortKey;
  /** When grouping by zone, the busiest zones lead instead of alphabetical order. */
  grouped: boolean;
  limit: number;
  offset: number;
};

type Clauses = { sql: string[]; params: unknown[] };

/**
 * Builds the shared WHERE clause. `skip` drops one dimension so facet counts
 * can be computed for it while every other active filter still applies - that
 * is what lets zone and niche filters work at the same time instead of one
 * narrowing the other's options away.
 */
function buildClauses(filters: BusinessFilters, skip?: "zone" | "niche" | "template"): Clauses {
  const sql: string[] = ["b.city_id = $1"];
  const params: unknown[] = [filters.cityId];

  if (skip !== "zone" && (filters.zoneIds.length > 0 || filters.includeNoZone)) {
    const predicates: string[] = [];
    if (filters.zoneIds.length > 0) {
      params.push(filters.zoneIds);
      predicates.push(`b.zone_id = any($${params.length}::int[])`);
    }
    if (filters.includeNoZone) predicates.push("b.zone_id is null");
    sql.push(`(${predicates.join(" or ")})`);
  }
  if (skip !== "niche" && filters.nicheKeys.length > 0) {
    params.push(filters.nicheKeys);
    sql.push(`b.niche_key = any($${params.length}::text[])`);
  }
  if (skip !== "template" && filters.templateKeys.length > 0) {
    params.push(filters.templateKeys);
    sql.push(`b.template_key = any($${params.length}::text[])`);
  }
  if (filters.website === "missing") sql.push("b.has_website = false");
  if (filters.website === "present") sql.push("b.has_website = true");
  if (filters.namedOnly) sql.push("b.name is not null");
  if (filters.search) {
    params.push(`%${filters.search}%`);
    sql.push(`(b.name ilike $${params.length} or b.niche_label ilike $${params.length})`);
  }

  return { sql, params };
}

const SORT_SQL: Record<SortKey, string> = {
  name: "b.name asc nulls last",
  niche: "b.niche_label asc, b.name asc nulls last",
  recent: "b.last_seen_at desc, b.name asc nulls last",
};

export async function listBusinesses(filters: BusinessFilters): Promise<BusinessRecord[]> {
  const { sql, params } = buildClauses(filters);
  params.push(filters.limit, filters.offset);

  // Grouped view: keep a zone's businesses together, busiest zone first, so the
  // neighbourhoods worth walking lead instead of the alphabet. Flat view sorts
  // purely by the chosen key.
  const groupOrder = filters.grouped ? "count(*) over (partition by b.zone_id) desc, z.name asc nulls last, " : "";

  const rows = await query<BusinessRow>(
    `
    select b.id, b.osm_type, b.osm_id, b.name, b.primary_tag, b.primary_value, b.niche_key,
           b.niche_label, b.template_key, b.zone_id, z.name as zone_name, z.source as zone_source,
           b.lat, b.lon, b.phone, b.email, b.website, b.has_website, b.opening_hours,
           b.addr_street, b.addr_housenumber, b.socials, b.last_seen_at
    from businesses b
    left join zones z on z.id = b.zone_id
    where ${sql.join(" and ")}
    order by ${groupOrder}${SORT_SQL[filters.sort]}
    limit $${params.length - 1} offset $${params.length}
    `,
    params,
  );

  return rows.map(toRecord);
}

export type Summary = {
  total: number;
  prospects: number;
  withPhone: number;
  unnamed: number;
};

export async function summarize(filters: BusinessFilters): Promise<Summary> {
  const { sql, params } = buildClauses(filters);
  const rows = await query<{ total: string; prospects: string; with_phone: string; unnamed: string }>(
    `
    select count(*) as total,
           count(*) filter (where b.has_website = false) as prospects,
           count(*) filter (where b.phone is not null) as with_phone,
           count(*) filter (where b.name is null) as unnamed
    from businesses b
    where ${sql.join(" and ")}
    `,
    params,
  );
  const row = rows[0]!;
  return {
    total: Number(row.total),
    prospects: Number(row.prospects),
    withPhone: Number(row.with_phone),
    unnamed: Number(row.unnamed),
  };
}

export type Facet = {
  value: string;
  label: string;
  total: number;
  prospects: number;
};

export async function zoneFacets(filters: BusinessFilters): Promise<Facet[]> {
  const { sql, params } = buildClauses(filters, "zone");
  const rows = await query<{ zone_id: number | null; zone_name: string | null; total: string; prospects: string }>(
    `
    select b.zone_id, z.name as zone_name,
           count(*) as total,
           count(*) filter (where b.has_website = false) as prospects
    from businesses b
    left join zones z on z.id = b.zone_id
    where ${sql.join(" and ")}
    group by b.zone_id, z.name
    order by z.name asc nulls last
    `,
    params,
  );
  return rows.map((row) => ({
    value: row.zone_id === null ? "none" : String(row.zone_id),
    label: row.zone_name ?? "No zone",
    total: Number(row.total),
    prospects: Number(row.prospects),
  }));
}

export async function nicheFacets(filters: BusinessFilters): Promise<Facet[]> {
  const { sql, params } = buildClauses(filters, "niche");
  const rows = await query<{ niche_key: string; niche_label: string; total: string; prospects: string }>(
    `
    select b.niche_key, b.niche_label,
           count(*) as total,
           count(*) filter (where b.has_website = false) as prospects
    from businesses b
    where ${sql.join(" and ")}
    group by b.niche_key, b.niche_label
    order by count(*) desc, b.niche_label asc
    `,
    params,
  );
  return rows.map((row) => ({
    value: row.niche_key,
    label: row.niche_label,
    total: Number(row.total),
    prospects: Number(row.prospects),
  }));
}

export async function templateFacets(filters: BusinessFilters): Promise<Facet[]> {
  const { sql, params } = buildClauses(filters, "template");
  const rows = await query<{ template_key: string; total: string; prospects: string }>(
    `
    select b.template_key,
           count(*) as total,
           count(*) filter (where b.has_website = false) as prospects
    from businesses b
    where ${sql.join(" and ")}
    group by b.template_key
    order by count(*) desc
    `,
    params,
  );
  return rows.map((row) => ({
    value: row.template_key,
    label: row.template_key,
    total: Number(row.total),
    prospects: Number(row.prospects),
  }));
}
