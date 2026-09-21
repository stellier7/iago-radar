export type MapMarkerVariant = "prospect" | "website" | "zone";

export type MapMarker = {
  id: string;
  lat: number;
  lon: number;
  label: string;
  subtitle?: string;
  variant: MapMarkerVariant;
  /** Zone markers: businesses without a website in this zone. */
  prospectCount?: number;
  /** Zone markers: total businesses in this zone. */
  totalCount?: number;
  /** Optional link opened from the marker popup. */
  href?: string;
};

export type MapViewport = {
  centerLat: number;
  centerLon: number;
  zoom: number;
};

export type BoundingBox = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};

/** Default view when there are no markers yet, or as a fallback while loading. */
export function viewportFromBBox(bbox: BoundingBox, zoom = 12): MapViewport {
  return {
    centerLat: (bbox.minLat + bbox.maxLat) / 2,
    centerLon: (bbox.minLon + bbox.maxLon) / 2,
    zoom,
  };
}

/** Picks a center/zoom that fits all markers; falls back when the list is empty. */
export function viewportFromMarkers(markers: Pick<MapMarker, "lat" | "lon">[], fallback: MapViewport): MapViewport {
  if (markers.length === 0) return fallback;
  if (markers.length === 1) {
    return { centerLat: markers[0]!.lat, centerLon: markers[0]!.lon, zoom: 15 };
  }

  let minLat = markers[0]!.lat;
  let maxLat = markers[0]!.lat;
  let minLon = markers[0]!.lon;
  let maxLon = markers[0]!.lon;
  for (const marker of markers) {
    minLat = Math.min(minLat, marker.lat);
    maxLat = Math.max(maxLat, marker.lat);
    minLon = Math.min(minLon, marker.lon);
    maxLon = Math.max(maxLon, marker.lon);
  }

  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  const span = Math.max(latSpan, lonSpan, 0.002);
  const zoom = span > 0.25 ? 11 : span > 0.12 ? 12 : span > 0.06 ? 13 : span > 0.03 ? 14 : 15;

  return {
    centerLat: (minLat + maxLat) / 2,
    centerLon: (minLon + maxLon) / 2,
    zoom,
  };
}
