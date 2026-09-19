import { loadEnv } from "./load-env";

loadEnv();

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function table(rows: Array<Record<string, string | number>>): void {
  if (rows.length === 0) {
    console.log("  (none)");
    return;
  }
  const columns = Object.keys(rows[0]!);
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)),
  );
  const line = (cells: Array<string | number>) =>
    "  " + cells.map((cell, i) => String(cell).padEnd(widths[i]!)).join("  ");
  console.log(line(columns));
  console.log("  " + widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(line(columns.map((column) => row[column] ?? "")));
}

/** Phase 1 acceptance check: is the crawled data good enough to sell from? */
async function main() {
  const citySlug = arg("city") ?? "tegucigalpa";

  const { getPool, query } = await import("../lib/db");
  const { getCityBySlug } = await import("../lib/repo/cities");
  const { areaKm2 } = await import("../lib/geo/bbox");
  const { splitIntoCells } = await import("../lib/geo/grid");

  const city = await getCityBySlug(citySlug);
  if (!city) throw new Error(`Unknown city: ${citySlug}`);

  const bbox = { minLat: city.minLat, minLon: city.minLon, maxLat: city.maxLat, maxLon: city.maxLon };
  const cells = splitIntoCells(bbox, city.cellSizeKm);

  console.log(`\n== ${city.name} ==`);
  console.log(`  bbox area     : ${areaKm2(bbox).toFixed(0)} km2`);
  console.log(`  grid          : ${cells.length} cells of ${city.cellSizeKm} km (${areaKm2(cells[0]!).toFixed(1)} km2 each)`);
  console.log(`  zone fallback : ${city.zoneSizeKm} km squares`);

  const [totals] = await query<{
    total: string;
    prospects: string;
    with_phone: string;
    with_email: string;
    with_social: string;
    with_hours: string;
    unnamed: string;
    tag_zoned: string;
  }>(
    `
    select count(*) as total,
           count(*) filter (where has_website = false) as prospects,
           count(*) filter (where phone is not null) as with_phone,
           count(*) filter (where email is not null) as with_email,
           count(*) filter (where socials <> '{}'::jsonb) as with_social,
           count(*) filter (where opening_hours is not null) as with_hours,
           count(*) filter (where name is null) as unnamed,
           count(*) filter (where z.source = 'osm_tag') as tag_zoned
    from businesses b left join zones z on z.id = b.zone_id
    where b.city_id = $1
    `,
    [city.id],
  );

  const total = Number(totals!.total);
  const pct = (value: string | number) => (total === 0 ? "0%" : `${((Number(value) / total) * 100).toFixed(1)}%`);

  console.log(`\n-- coverage (${total} businesses) --`);
  table([
    { metric: "no website (prospects)", count: totals!.prospects, share: pct(totals!.prospects) },
    { metric: "has phone", count: totals!.with_phone, share: pct(totals!.with_phone) },
    { metric: "has email", count: totals!.with_email, share: pct(totals!.with_email) },
    { metric: "has social profile", count: totals!.with_social, share: pct(totals!.with_social) },
    { metric: "has opening hours", count: totals!.with_hours, share: pct(totals!.with_hours) },
    { metric: "unnamed", count: totals!.unnamed, share: pct(totals!.unnamed) },
    { metric: "zone from OSM tag", count: totals!.tag_zoned, share: pct(totals!.tag_zoned) },
  ]);

  console.log("\n-- top niches --");
  table(
    (
      await query<{ niche_label: string; total: string; prospects: string }>(
        `select niche_label, count(*) as total, count(*) filter (where has_website = false) as prospects
         from businesses where city_id = $1 group by niche_label order by count(*) desc limit 20`,
        [city.id],
      )
    ).map((row) => ({ niche: row.niche_label, total: row.total, prospects: row.prospects })),
  );

  console.log("\n-- template match --");
  table(
    (
      await query<{ template_key: string; total: string; prospects: string }>(
        `select template_key, count(*) as total, count(*) filter (where has_website = false) as prospects
         from businesses where city_id = $1 group by template_key order by count(*) desc`,
        [city.id],
      )
    ).map((row) => ({ template: row.template_key, total: row.total, prospects: row.prospects })),
  );

  console.log("\n-- top zones --");
  table(
    (
      await query<{ name: string; source: string; total: string; prospects: string }>(
        `select z.name, z.source, count(b.id) as total, count(b.id) filter (where b.has_website = false) as prospects
         from zones z join businesses b on b.zone_id = z.id
         where z.city_id = $1 group by z.id order by count(b.id) desc limit 15`,
        [city.id],
      )
    ).map((row) => ({ zone: row.name, source: row.source, total: row.total, prospects: row.prospects })),
  );

  console.log("\n-- crawl runs --");
  table(
    (
      await query<{
        id: string;
        status: string;
        trigger: string;
        cells_total: number;
        done: string;
        failed: string;
        elements_seen: number;
        started_at: Date;
      }>(
        `select r.id, r.status, r.trigger, r.cells_total, r.elements_seen, r.started_at,
                count(c.id) filter (where c.status = 'done') as done,
                count(c.id) filter (where c.status = 'failed') as failed
         from crawl_runs r left join crawl_cells c on c.run_id = r.id
         where r.city_id = $1 group by r.id order by r.started_at desc limit 5`,
        [city.id],
      )
    ).map((row) => ({
      run: row.id,
      status: row.status,
      trigger: row.trigger,
      cells: `${row.done}/${row.cells_total}`,
      failed: row.failed,
      elements: row.elements_seen,
      started: row.started_at.toISOString().slice(0, 16).replace("T", " "),
    })),
  );

  console.log("\n-- sample prospects --");
  table(
    (
      await query<{
        name: string | null;
        niche_label: string;
        zone: string | null;
        phone: string | null;
        socials: Record<string, string>;
      }>(
        `select b.name, b.niche_label, z.name as zone, b.phone, b.socials
         from businesses b left join zones z on z.id = b.zone_id
         where b.city_id = $1 and b.has_website = false and b.name is not null
         order by (b.phone is null), b.name limit 15`,
        [city.id],
      )
    ).map((row) => ({
      name: (row.name ?? "").slice(0, 32),
      niche: row.niche_label.slice(0, 28),
      zone: (row.zone ?? "-").slice(0, 22),
      phone: row.phone ?? "-",
      socials: Object.keys(row.socials ?? {}).join(",") || "-",
    })),
  );

  console.log("");
  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
