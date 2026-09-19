import { getPool, query, type Queryable } from "../db";
import type { ZoneAssignment } from "../zones/derive";

export type ZoneSource = "osm_tag" | "osm_place" | "grid";

export type Zone = {
  id: number;
  cityId: number;
  derivationKey: string;
  name: string;
  source: ZoneSource;
  centerLat: number | null;
  centerLon: number | null;
  mergedIntoZoneId: number | null;
};

export type ZoneWithCounts = Zone & {
  businessCount: number;
  prospectCount: number;
};

type ZoneRow = {
  id: number;
  city_id: number;
  derivation_key: string;
  name: string;
  source: ZoneSource;
  center_lat: number | null;
  center_lon: number | null;
  merged_into_zone_id: number | null;
};

function toZone(row: ZoneRow): Zone {
  return {
    id: row.id,
    cityId: row.city_id,
    derivationKey: row.derivation_key,
    name: row.name,
    source: row.source,
    centerLat: row.center_lat,
    centerLon: row.center_lon,
    mergedIntoZoneId: row.merged_into_zone_id,
  };
}

/** Follows merge pointers so businesses land on the zone you actually kept. */
async function resolveMergeTarget(db: Queryable, zoneId: number): Promise<number> {
  let current = zoneId;
  for (let hop = 0; hop < 10; hop++) {
    const result = await db.query<{ merged_into_zone_id: number | null }>(
      "select merged_into_zone_id from zones where id = $1",
      [current],
    );
    const next = result.rows[0]?.merged_into_zone_id ?? null;
    if (next === null || next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Finds or creates the zone for a derived assignment and returns the id the
 * business should be filed under.
 */
export async function resolveZoneId(db: Queryable, cityId: number, assignment: ZoneAssignment): Promise<number> {
  const result = await db.query<{ id: number; merged_into_zone_id: number | null }>(
    `
    insert into zones (city_id, derivation_key, name, source, center_lat, center_lon)
    values ($1, $2, $3, $4, $5, $6)
    on conflict (city_id, derivation_key) do update set updated_at = now()
    returning id, merged_into_zone_id
    `,
    [cityId, assignment.derivationKey, assignment.name, assignment.source, assignment.centerLat, assignment.centerLon],
  );

  const row = result.rows[0]!;
  return row.merged_into_zone_id === null ? row.id : resolveMergeTarget(db, row.merged_into_zone_id);
}

/**
 * Caches zone lookups for the duration of a crawl, so a cell with 200
 * businesses in one neighbourhood does one zone round-trip instead of 200.
 */
export function createZoneResolver(db: Queryable, cityId: number) {
  const cache = new Map<string, number>();
  return async (assignment: ZoneAssignment): Promise<number> => {
    const cached = cache.get(assignment.derivationKey);
    if (cached !== undefined) return cached;
    const zoneId = await resolveZoneId(db, cityId, assignment);
    cache.set(assignment.derivationKey, zoneId);
    return zoneId;
  };
}

export async function listZonesWithCounts(cityId: number): Promise<ZoneWithCounts[]> {
  const rows = await query<ZoneRow & { business_count: string; prospect_count: string }>(
    `
    select z.id, z.city_id, z.derivation_key, z.name, z.source, z.center_lat, z.center_lon,
           z.merged_into_zone_id,
           count(b.id) as business_count,
           count(b.id) filter (where b.has_website = false) as prospect_count
    from zones z
    left join businesses b on b.zone_id = z.id
    where z.city_id = $1
    group by z.id
    order by z.name
    `,
    [cityId],
  );

  return rows.map((row) => ({
    ...toZone(row),
    businessCount: Number(row.business_count),
    prospectCount: Number(row.prospect_count),
  }));
}

/**
 * Deletes auto-generated grid zones that no longer hold any business, which is
 * what re-deriving leaves behind when a better zone source appears. Zones you
 * renamed are kept: their name no longer matches the generated pattern.
 */
export async function pruneEmptyAutoZones(cityId: number): Promise<number> {
  const rows = await query<{ id: number }>(
    `
    delete from zones z
    where z.city_id = $1
      and z.source = 'grid'
      and z.merged_into_zone_id is null
      and z.name ~ '^Grid [A-Z]+[0-9]+$'
      and not exists (select 1 from businesses b where b.zone_id = z.id)
    returning z.id
    `,
    [cityId],
  );
  return rows.length;
}

export async function renameZone(zoneId: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Zone name cannot be empty");
  await query("update zones set name = $2, updated_at = now() where id = $1", [zoneId, trimmed]);
}

/**
 * Merges `sourceZoneId` into `targetZoneId`: existing businesses are repointed
 * and the source keeps a pointer so future crawls follow the merge.
 */
export async function mergeZones(sourceZoneId: number, targetZoneId: number): Promise<void> {
  if (sourceZoneId === targetZoneId) throw new Error("Cannot merge a zone into itself");

  const client = await getPool().connect();
  try {
    await client.query("begin");

    const zones = await client.query<{ id: number; city_id: number }>(
      "select id, city_id from zones where id = any($1::int[]) for update",
      [[sourceZoneId, targetZoneId]],
    );
    if (zones.rows.length !== 2) throw new Error("Both zones must exist");
    if (zones.rows[0]!.city_id !== zones.rows[1]!.city_id) {
      throw new Error("Cannot merge zones from different cities");
    }

    // Walking the target's pointers stops A->B, B->A from creating a cycle.
    const resolvedTarget = await resolveMergeTarget(client, targetZoneId);
    if (resolvedTarget === sourceZoneId) throw new Error("That merge would create a loop");

    await client.query("update businesses set zone_id = $2, updated_at = now() where zone_id = $1", [
      sourceZoneId,
      resolvedTarget,
    ]);
    await client.query("update zones set merged_into_zone_id = $2, updated_at = now() where id = $1", [
      sourceZoneId,
      resolvedTarget,
    ]);
    // Anything already pointing at the source should follow it to the target.
    await client.query("update zones set merged_into_zone_id = $2 where merged_into_zone_id = $1", [
      sourceZoneId,
      resolvedTarget,
    ]);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
