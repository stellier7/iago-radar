import { loadEnv } from "./load-env";

loadEnv();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/**
 * Adds a crawl target by geocoding it with Nominatim.
 *
 *   npx tsx scripts/add-city.ts --name=Comayagua --country=Honduras
 *   npx tsx scripts/add-city.ts --name=Comayagua --country=Honduras --cell-km=1.5
 */
async function main() {
  const name = arg("name");
  const country = arg("country") ?? "Honduras";
  if (!name) throw new Error("Usage: tsx scripts/add-city.ts --name=<city> [--country=Honduras] [--cell-km=2]");

  const { geocodeCity } = await import("../lib/osm/nominatim");
  const { upsertCity } = await import("../lib/repo/cities");
  const { areaKm2 } = await import("../lib/geo/bbox");
  const { splitIntoCells } = await import("../lib/geo/grid");
  const { slugify } = await import("../lib/zones/derive");
  const { getPool } = await import("../lib/db");

  const place = await geocodeCity(name, country);
  if (!place) throw new Error(`Nominatim found no match for "${name}, ${country}"`);

  const cellSizeKm = Number(arg("cell-km") ?? 2);
  const cells = splitIntoCells(place.bbox, cellSizeKm);

  console.log(`Matched: ${place.displayName}`);
  console.log(`  bbox : ${JSON.stringify(place.bbox)} (${areaKm2(place.bbox).toFixed(0)} km2)`);
  console.log(`  grid : ${cells.length} cells of ${cellSizeKm} km -> ${cells.length} Overpass requests per full pass`);

  const city = await upsertCity({
    slug: arg("slug") ?? slugify(name),
    name,
    countryCode: arg("country-code") ?? null,
    bbox: place.bbox,
    cellSizeKm,
    zoneSizeKm: arg("zone-km") ? Number(arg("zone-km")) : undefined,
  });

  console.log(`Saved city "${city.slug}" (id ${city.id}). Crawl it with: npm run crawl -- --city=${city.slug}`);
  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
