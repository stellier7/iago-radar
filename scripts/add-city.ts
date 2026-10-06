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

  const { addCityFromName } = await import("../lib/cities/add");
  const { getPool } = await import("../lib/db");

  const result = await addCityFromName({
    name,
    country,
    countryCode: arg("country-code") ?? null,
    cellSizeKm: arg("cell-km") ? Number(arg("cell-km")) : undefined,
  });

  console.log(`Matched: ${result.displayName}`);
  if (result.clamped) {
    console.log("  note  : Nominatim box was too large; stored a ~14 km urban square instead");
  }
  console.log(`  area  : ${result.areaKm2.toFixed(0)} km2`);
  console.log(`  grid  : ${result.cells} cells -> ${result.cells} Overpass requests per full pass`);
  console.log(`Saved city "${result.city.slug}" (id ${result.city.id}). Crawl it with: npm run crawl -- --city=${result.city.slug}`);
  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
