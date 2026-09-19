"use client";

import { useActionState } from "react";

import { mergeZonesAction, renameZoneAction, type ZoneActionResult } from "@/app/zones/actions";
import type { ZoneWithCounts } from "@/lib/repo/zones";

export const ZONE_SOURCE_LABELS: Record<ZoneWithCounts["source"], string> = {
  osm_tag: "from addr: tag",
  osm_place: "nearest OSM place",
  grid: "auto grid square",
};

export function ZoneRow({ zone, allZones }: { zone: ZoneWithCounts; allZones: ZoneWithCounts[] }) {
  const [renameResult, rename, renaming] = useActionState<ZoneActionResult | null, FormData>(renameZoneAction, null);
  const [mergeResult, merge, merging] = useActionState<ZoneActionResult | null, FormData>(mergeZonesAction, null);

  const mergeTargets = allZones.filter((candidate) => candidate.id !== zone.id && candidate.mergedIntoZoneId === null);
  const error = renameResult?.error ?? mergeResult?.error;

  return (
    <li className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {zone.businessCount} businesses · {zone.prospectCount} without a site
        </p>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
          {ZONE_SOURCE_LABELS[zone.source]}
        </span>
      </div>

      <form action={rename} className="mt-2 flex gap-2">
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

      {mergeTargets.length > 0 && (
        <form action={merge} className="mt-2 flex gap-2">
          <input type="hidden" name="sourceZoneId" value={zone.id} />
          <select
            name="targetZoneId"
            defaultValue=""
            aria-label={`Merge ${zone.name} into`}
            className="tap-target flex-1 rounded-lg border border-line bg-surface px-2 text-sm"
          >
            <option value="" disabled>
              Merge into…
            </option>
            {mergeTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name} ({target.businessCount})
              </option>
            ))}
          </select>
          <button type="submit" disabled={merging} className="tap-target rounded-lg border border-line px-3 text-sm">
            {merging ? "Merging" : "Merge"}
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-sm text-flag-ink">{error}</p>}
    </li>
  );
}
