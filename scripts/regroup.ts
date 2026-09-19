import { loadEnv } from "./load-env";

loadEnv();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/**
 * Recomputes everything we derive from the stored OSM tags: niche, zone,
 * template match, contact fields, website flag.
 *
 * Run this after adding a template, widening the amenity allowlist, or changing
 * a city's zone_size_km. It rebuilds from the tags already in the database, so
 * it costs no Overpass requests.
 */
async function main() {
  const citySlug = arg("city") ?? "tegucigalpa";

  const { getPool, query } = await import("../lib/db");
  const { getCityBySlug, cityBbox } = await import("../lib/repo/cities");
  const { normalizeElement } = await import("../lib/osm/normalize");
  const { deriveZone } = await import("../lib/zones/derive");
  const { createZoneResolver } = await import("../lib/repo/zones");
  const { upsertBusinesses } = await import("../lib/repo/businesses");
  const { classify } = await import("../lib/osm/categories");

  const city = await getCityBySlug(citySlug);
  if (!city) throw new Error(`Unknown city: ${citySlug}`);

  const rows = await query<{
    osm_type: "node" | "way" | "relation";
    osm_id: string;
    lat: number | null;
    lon: number | null;
    tags: Record<string, string>;
  }>("select osm_type, osm_id, lat, lon, tags from businesses where city_id = $1", [city.id]);

  console.log(`Re-deriving ${rows.length} businesses in ${city.name}...`);

  const zoneConfig = { ...cityBbox(city), zoneSizeKm: city.zoneSizeKm };
  const pool = getPool();
  const client = await pool.connect();
  let rewritten = 0;
  let dropped = 0;

  try {
    await client.query("begin");
    const resolveZone = createZoneResolver(client, city.id);

    for (const row of rows) {
      const normalized = normalizeElement({
        type: row.osm_type,
        id: Number(row.osm_id),
        lat: row.lat ?? undefined,
        lon: row.lon ?? undefined,
        tags: row.tags,
      });

      // A tag allowlist can narrow as well as widen; say so rather than
      // silently leaving a stale row behind.
      if (!normalized || !classify(row.tags)) {
        dropped += 1;
        continue;
      }

      const zoneId = await resolveZone(deriveZone(normalized, zoneConfig));
      await upsertBusinesses(client, city.id, [{ ...normalized, zoneId }]);
      rewritten += 1;
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  console.log(`  rewritten: ${rewritten}`);
  if (dropped > 0) {
    console.log(`  no longer classified as a business (left untouched): ${dropped}`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
