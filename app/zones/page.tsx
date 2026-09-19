import { ZoneRow } from "@/components/zone-row";
import { getCityBySlug } from "@/lib/repo/cities";
import { listZonesWithCounts } from "@/lib/repo/zones";
import { parseFilters, type RawSearchParams } from "@/lib/ui/filters";

export const dynamic = "force-dynamic";

export default async function ZonesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { citySlug } = parseFilters(await searchParams);
  const city = await getCityBySlug(citySlug);

  if (!city) {
    return <p className="text-sm text-ink-muted">No city called &ldquo;{citySlug}&rdquo;.</p>;
  }

  const zones = await listZonesWithCounts(city.id);
  const active = zones.filter((zone) => zone.mergedIntoZoneId === null);
  const merged = zones.filter((zone) => zone.mergedIntoZoneId !== null);
  const named = active.filter((zone) => zone.source === "osm_tag").length;

  return (
    <div>
      <p className="mb-1 text-sm text-ink-muted">
        <strong className="text-ink">{active.length}</strong> zones in {city.name} · {named} from OSM neighbourhood tags
        · {active.length - named} auto-generated {city.zoneSizeKm} km squares
      </p>
      <p className="mb-4 text-xs text-ink-muted">
        Rename an auto grid zone once you recognise the area, or merge it into a neighbour. Renaming keeps its identity,
        so the next crawl files businesses under the name you chose.
      </p>

      {active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">
          Zones appear after the first crawl.
        </p>
      ) : (
        <ul className="space-y-2">
          {active
            .slice()
            .sort((a, b) => b.businessCount - a.businessCount || a.name.localeCompare(b.name))
            .map((zone) => (
              <li key={zone.id} className="contents">
                <details className="rounded-xl border border-line bg-surface-muted">
                  <summary className="tap-target cursor-pointer select-none px-3 text-sm font-semibold">
                    {zone.name}
                    <span className="ml-2 font-normal text-ink-muted">
                      {zone.businessCount} · {zone.prospectCount} without a site
                    </span>
                  </summary>
                  <ul className="p-2 pt-0">
                    <ZoneRow zone={zone} allZones={active} />
                  </ul>
                </details>
              </li>
            ))}
        </ul>
      )}

      {merged.length > 0 && (
        <p className="mt-4 text-xs text-ink-muted">
          {merged.length} zone{merged.length === 1 ? "" : "s"} merged away. Their OSM tags and grid squares now resolve
          to the zone you kept.
        </p>
      )}
    </div>
  );
}
