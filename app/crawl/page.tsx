import { RunSliceButton } from "@/components/run-slice-button";
import { SetupNotice } from "@/components/setup-notice";
import { areaKm2 } from "@/lib/geo/bbox";
import { splitIntoCells } from "@/lib/geo/grid";
import { MAX_QUERY_AREA_KM2, OVERPASS_TIMEOUT_SECONDS } from "@/lib/osm/overpass";
import { cityBbox, getCityBySlug } from "@/lib/repo/cities";
import { getRunProgress, listFailedCells, listRecentRuns } from "@/lib/repo/crawl";
import { parseFilters, type RawSearchParams } from "@/lib/ui/filters";
import { loadOrExplainSetup } from "@/lib/ui/setup";

export const dynamic = "force-dynamic";

export default async function CrawlPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { citySlug } = parseFilters(await searchParams);

  const cityResult = await loadOrExplainSetup(() => getCityBySlug(citySlug));
  if (!cityResult.ok) return <SetupNotice problem={cityResult.problem} />;
  const city = cityResult.data;

  if (!city) {
    return <p className="text-sm text-ink-muted">No city called &ldquo;{citySlug}&rdquo;.</p>;
  }

  const bbox = cityBbox(city);
  const cells = splitIntoCells(bbox, city.cellSizeKm);
  const runs = await listRecentRuns(city.id, 6);
  const progress = await Promise.all(runs.map((run) => getRunProgress(run.id)));
  const latest = runs[0];
  const failedCells = latest ? await listFailedCells(latest.id, 5) : [];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-3">
        <h2 className="text-sm font-semibold">Grid for {city.name}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-muted">Bounding box</dt>
          <dd className="text-right tabular-nums">{areaKm2(bbox).toFixed(0)} km²</dd>
          <dt className="text-ink-muted">Cells per full pass</dt>
          <dd className="text-right tabular-nums">{cells.length}</dd>
          <dt className="text-ink-muted">Cell size</dt>
          <dd className="text-right tabular-nums">
            {city.cellSizeKm} km ({areaKm2(cells[0]!).toFixed(1)} km²)
          </dd>
          <dt className="text-ink-muted">Overpass timeout asked for</dt>
          <dd className="text-right tabular-nums">{OVERPASS_TIMEOUT_SECONDS}s</dd>
        </dl>
        <p className="mt-2 text-xs text-ink-muted">
          One Overpass request per cell, at least 1.2s apart. Single queries above {MAX_QUERY_AREA_KM2} km² are rejected
          before they are sent — a whole-city query times out instead of returning data.
        </p>
        <RunSliceButton citySlug={city.slug} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">
            No crawl has run yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run, index) => {
              const cellProgress = progress[index]!;
              const percent = cellProgress.total === 0 ? 0 : (cellProgress.done / cellProgress.total) * 100;
              return (
                <li key={run.id} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      Run {run.id}
                      <span className="ml-2 font-normal text-ink-muted">{run.trigger}</span>
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        run.status === "running" ? "bg-flag text-flag-ink" : "bg-surface-muted text-ink-muted"
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    {cellProgress.done}/{cellProgress.total} cells · {cellProgress.outstanding} queued ·{" "}
                    {cellProgress.failed} failed · {run.elementsSeen} OSM elements · {run.overpassRequests} Overpass
                    requests
                  </p>
                  <p className="text-xs text-ink-muted">
                    started {new Date(run.startedAt).toLocaleString()}
                    {run.finishedAt && ` · finished ${new Date(run.finishedAt).toLocaleString()}`}
                  </p>
                  {run.error && <p className="mt-1 text-xs text-flag-ink">{run.error}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {failedCells.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Failed cells in run {latest!.id}</h2>
          <ul className="space-y-1 text-xs text-ink-muted">
            {failedCells.map((cell) => (
              <li key={cell.idx} className="rounded-lg border border-line bg-surface p-2">
                cell {cell.idx} after {cell.attempts} attempt{cell.attempts === 1 ? "" : "s"}: {cell.error}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
