"use client";

import dynamic from "next/dynamic";

import type { MapMarker, MapViewport } from "@/lib/ui/map";

const MapPreview = dynamic(() => import("@/components/map-preview").then((module) => module.MapPreview), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 items-center justify-center rounded-lg border border-line bg-surface-muted text-sm text-ink-muted sm:h-64">
      Loading map…
    </div>
  ),
});

export type MapPanelProps = {
  title: string;
  hint?: string;
  markers: MapMarker[];
  viewport: MapViewport;
  /** Open by default on wider screens; collapsed on phones to save scroll space. */
  defaultOpen?: boolean;
};

export function MapPanel({ title, hint, markers, viewport, defaultOpen = false }: MapPanelProps) {
  if (markers.length === 0) return null;

  return (
    <details className="mb-4 rounded-xl border border-line bg-surface" open={defaultOpen}>
      <summary className="tap-target cursor-pointer select-none px-3 text-sm font-medium">
        {title}
        <span className="ml-2 text-xs font-normal text-ink-muted">{markers.length} on map</span>
      </summary>
      <div className="space-y-2 border-t border-line px-3 py-3">
        {hint && <p className="text-xs text-ink-muted">{hint}</p>}
        <MapPreview markers={markers} viewport={viewport} />
        <p className="text-[11px] text-ink-muted">
          Tap a pin for details. Blue = no website found · grey = has a website tag · gold = zone cluster.
        </p>
      </div>
    </details>
  );
}
