"use client";

import { useEffect, useRef } from "react";

import type { MapMarker, MapViewport } from "@/lib/ui/map";

type LeafletModule = typeof import("leaflet");

const MARKER_STYLE: Record<MapMarker["variant"], { radius: number; color: string; fillColor: string }> = {
  prospect: { radius: 6, color: "#1f6feb", fillColor: "#4d94ff" },
  website: { radius: 5, color: "#616b76", fillColor: "#9aa4b0" },
  zone: { radius: 10, color: "#8a4b00", fillColor: "#f6c886" },
};

function popupHtml(marker: MapMarker): string {
  const lines = [`<strong>${escapeHtml(marker.label)}</strong>`];
  if (marker.subtitle) lines.push(`<span>${escapeHtml(marker.subtitle)}</span>`);
  if (marker.href) {
    lines.push(`<a href="${escapeHtml(marker.href)}" style="margin-top:0.25rem;display:inline-block">View prospects</a>`);
  }
  return lines.join("<br />");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type MapPreviewProps = {
  markers: MapMarker[];
  viewport: MapViewport;
  className?: string;
};

/** Interactive Leaflet map using free OpenStreetMap raster tiles. */
export function MapPreview({ markers, viewport, className = "" }: MapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = leaflet;

      const map = leaflet.map(containerRef.current, {
        center: [viewport.centerLat, viewport.centerLon],
        zoom: viewport.zoom,
        scrollWheelZoom: false,
      });

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map);

      layerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;

      // Leaflet measures the container on init; on mobile the details panel may
      // still be animating open, so recalculate once layout settles.
      window.setTimeout(() => map.invalidateSize(), 0);
      window.setTimeout(() => map.invalidateSize(), 250);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      leafletRef.current = null;
    };
    // Mount once; marker/viewport updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!leaflet || !map || !layer) return;

    layer.clearLayers();

    const latLngs: [number, number][] = [];
    for (const marker of markers) {
      const style = MARKER_STYLE[marker.variant];
      const point = leaflet.circleMarker([marker.lat, marker.lon], {
        radius: style.radius,
        color: style.color,
        weight: 2,
        fillColor: style.fillColor,
        fillOpacity: 0.85,
      });
      point.bindPopup(popupHtml(marker), { maxWidth: 240 });
      point.addTo(layer);
      latLngs.push([marker.lat, marker.lon]);
    }

    if (latLngs.length === 1) {
      map.setView(latLngs[0]!, 15);
    } else if (latLngs.length > 1) {
      map.fitBounds(leaflet.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 15 });
    } else {
      map.setView([viewport.centerLat, viewport.centerLon], viewport.zoom);
    }

    map.invalidateSize();
  }, [markers, viewport.centerLat, viewport.centerLon, viewport.zoom]);

  return (
    <div
      ref={containerRef}
      className={`z-0 h-56 w-full rounded-lg border border-line sm:h-64 ${className}`}
      aria-label="Map preview"
    />
  );
}
