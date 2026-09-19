"use client";

import { useActionState, useState } from "react";

import { mergeZonesAction, renameZoneAction, type ZoneActionResult } from "@/app/zones/actions";
import type { ZoneWithCounts } from "@/lib/repo/zones";

const ZONE_SOURCE_LABELS: Record<ZoneWithCounts["source"], string> = {
  osm_tag: "from addr: tag",
  osm_place: "nearest OSM place",
  grid: "auto grid square",
};

/**
 * Renders every zone from one shared array.
 *
 * Each row needs the full list of merge targets. Passing that list per row makes
 * the payload quadratic - 200 zones turned into a 4 MB page - so the list is
 * sent once and the rows read from it.
 */
export function ZoneManager({ zones }: { zones: ZoneWithCounts[] }) {
  return (
    <ul className="space-y-2">
      {zones.map((zone) => (
        <ZoneRow key={zone.id} zone={zone} zones={zones} />
      ))}
    </ul>
  );
}

function ZoneRow({ zone, zones }: { zone: ZoneWithCounts; zones: ZoneWithCounts[] }) {
  const [renameResult, rename, renaming] = useActionState<ZoneActionResult | null, FormData>(renameZoneAction, null);
  const [mergeResult, merge, merging] = useActionState<ZoneActionResult | null, FormData>(mergeZonesAction, null);
  const [mergeOpen, setMergeOpen] = useState(false);

  const error = renameResult?.error ?? mergeResult?.error;

  return (
    <li className="rounded-xl border border-line bg-surface">
      <details>
        <summary className="tap-target cursor-pointer select-none px-3 text-sm font-semibold">
          {zone.name}
          <span className="ml-2 font-normal text-ink-muted">
            {zone.businessCount} · {zone.prospectCount} without a site
          </span>
        </summary>

        <div className="border-t border-line p-3">
          <p className="mb-2 text-xs text-ink-muted">{ZONE_SOURCE_LABELS[zone.source]}</p>

          <form action={rename} className="flex gap-2">
            <input type="hidden" name="zoneId" value={zone.id} />
            <input
              name="name"
              defaultValue={zone.name}
              aria-label={`Name for zone ${zone.name}`}
              className="tap-target flex-1 rounded-lg border border-line bg-surface px-3 text-base"
            />
            <button type="submit" disabled={renaming} className="tap-target rounded-lg border border-line px-3 text-sm">
              {renaming ? "Saving" : "Rename"}
            </button>
          </form>

          {mergeOpen ? (
            <form action={merge} className="mt-2 flex gap-2">
              <input type="hidden" name="sourceZoneId" value={zone.id} />
              <select
                name="targetZoneId"
                defaultValue=""
                aria-label={`Merge ${zone.name} into`}
                className="tap-target flex-1 rounded-lg border border-line bg-surface px-2 text-sm"
              >
                <option value="" disabled>
                  Choose a zone…
                </option>
                {zones
                  .filter((candidate) => candidate.id !== zone.id)
                  .map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name} ({target.businessCount})
                    </option>
                  ))}
              </select>
              <button type="submit" disabled={merging} className="tap-target rounded-lg border border-line px-3 text-sm">
                {merging ? "Merging" : "Merge"}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setMergeOpen(true)}
              className="tap-target mt-2 w-full rounded-lg border border-line px-3 text-sm text-ink-muted"
            >
              Merge into another zone…
            </button>
          )}

          {error && <p className="mt-2 text-sm text-flag-ink">{error}</p>}
          {mergeResult && !mergeResult.error && <p className="mt-2 text-sm text-ink-muted">Merged.</p>}
        </div>
      </details>
    </li>
  );
}
