import { SetupNotice } from "@/components/setup-notice";
import { MapPanel } from "@/components/map-panel";
import { ZoneManager } from "@/components/zone-manager";
import { cityBbox, getCityBySlug } from "@/lib/repo/cities";
import { listZoneMapMarkers, listZonesWithCounts } from "@/lib/repo/zones";
import { parseFilters, type RawSearchParams } from "@/lib/ui/filters";
import { viewportFromBBox, viewportFromMarkers } from "@/lib/ui/map";
import { loadOrExplainSetup } from "@/lib/ui/setup";

export const dynamic = "force-dynamic";

export default async function ZonesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { citySlug } = parseFilters(await searchParams);

  const cityResult = await loadOrExplainSetup(() => getCityBySlug(citySlug));
  if (!cityResult.ok) return <SetupNotice problem={cityResult.problem} />;
  const city = cityResult.data;

  if (!city) {
    return <p className="text-sm text-ink-muted">No city called &ldquo;{citySlug}&rdquo;.</p>;
  }

  const zones = await listZonesWithCounts(city.id);
  const zoneMarkers = await listZoneMapMarkers(city.id);
  const mapViewport = viewportFromMarkers(zoneMarkers, viewportFromBBox(cityBbox(city)));
  const merged = zones.filter((zone) => zone.mergedIntoZoneId !== null);
  // An empty zone is a leftover from re-deriving; there is nothing to act on.
  const active = zones.filter((zone) => zone.mergedIntoZoneId === null && zone.businessCount > 0);
  const fromOsm = active.filter((zone) => zone.source !== "grid").length;

  return (
    <div>
      <p className="mb-1 text-sm text-ink-muted">
        <strong className="text-ink">{active.length}</strong> zones in {city.name} · {fromOsm} named by OpenStreetMap ·{" "}
        {active.length - fromOsm} auto-generated {city.zoneSizeKm} km squares
      </p>
      <p className="mb-4 text-xs text-ink-muted">
        Zones come from a business&rsquo;s own <code>addr:</code> tag, else the nearest named OSM neighbourhood, else a
        grid square. Rename one once you recognise the area, or merge it into a neighbour. Renaming keeps a zone&rsquo;s
        identity, so the next crawl files businesses under the name you chose.
      </p>

      <MapPanel
        title="Zone map"
        hint="Each pin is the average location of businesses in that zone. Tap one to jump to its prospects."
        markers={zoneMarkers}
        viewport={mapViewport}
        defaultOpen
      />

      {active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">
          Zones appear after the first crawl.
        </p>
      ) : (
        <ZoneManager
          zones={active
            .slice()
            .sort((a, b) => b.businessCount - a.businessCount || a.name.localeCompare(b.name))}
        />
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
