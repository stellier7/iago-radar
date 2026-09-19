import { distanceKm, kmToLatDegrees, kmToLonDegrees, type BoundingBox } from "../geo/bbox";
import type { NormalizedBusiness } from "../osm/normalize";
import type { OsmPlace } from "../osm/places";

export type ZoneAssignment = {
  /** Stable identity for the zone. Renaming a zone must not change this. */
  derivationKey: string;
  name: string;
  source: "osm_tag" | "osm_place" | "grid";
  centerLat: number;
  centerLon: number;
};

export type ZoneGridConfig = BoundingBox & {
  zoneSizeKm: number;
};

/**
 * How far a business may be from a named neighbourhood centre and still be
 * filed under it. Place nodes mark a rough centre, not a boundary, so this is a
 * judgement call: wide enough to cover a colonia, tight enough that an isolated
 * business on the edge of town falls back to the grid instead of being filed
 * under a neighbourhood it is nowhere near.
 */
export const MAX_PLACE_DISTANCE_KM = 1.2;

export function nearestPlace(places: readonly OsmPlace[], lat: number, lon: number): OsmPlace | null {
  let best: OsmPlace | null = null;
  let bestDistance = Infinity;

  for (const place of places) {
    const distance = distanceKm(lat, lon, place.lat, place.lon);
    if (distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }

  return bestDistance <= MAX_PLACE_DISTANCE_KM ? best : null;
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** 0 -> A, 25 -> Z, 26 -> AA. Used for human-readable grid zone names. */
export function rowLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * Which fallback grid square a coordinate lands in, relative to the city's
 * bounding box origin. Deterministic for a given city config, so the same
 * business always lands in the same zone across crawls.
 */
export function gridZoneIndex(config: ZoneGridConfig, lat: number, lon: number): { row: number; col: number } {
  const meanLat = (config.minLat + config.maxLat) / 2;
  const latStep = kmToLatDegrees(config.zoneSizeKm);
  const lonStep = kmToLonDegrees(config.zoneSizeKm, meanLat);
  return {
    row: Math.max(0, Math.floor((lat - config.minLat) / latStep)),
    col: Math.max(0, Math.floor((lon - config.minLon) / lonStep)),
  };
}

function gridZone(config: ZoneGridConfig, lat: number, lon: number): ZoneAssignment {
  const { row, col } = gridZoneIndex(config, lat, lon);
  const meanLat = (config.minLat + config.maxLat) / 2;
  const latStep = kmToLatDegrees(config.zoneSizeKm);
  const lonStep = kmToLonDegrees(config.zoneSizeKm, meanLat);
  return {
    derivationKey: `grid:${row}:${col}`,
    name: `Grid ${rowLabel(row)}${col + 1}`,
    source: "grid",
    centerLat: config.minLat + (row + 0.5) * latStep,
    centerLon: config.minLon + (col + 0.5) * lonStep,
  };
}

/**
 * Zone for a business, in order of preference:
 *
 * 1. Its own `addr:suburb` / `addr:neighbourhood` tag. Best, but rare - not one
 *    of Tegucigalpa's 2371 businesses had it.
 * 2. The nearest named OSM `place` node within MAX_PLACE_DISTANCE_KM. This is
 *    what gives real names like "Colonia Kennedy".
 * 3. A fallback grid square, named "Grid B7", to be renamed by hand.
 */
export function deriveZone(
  business: Pick<NormalizedBusiness, "addrSuburb" | "addrNeighbourhood" | "lat" | "lon" | "tags">,
  config: ZoneGridConfig,
  places: readonly OsmPlace[] = [],
): ZoneAssignment {
  const lat = business.lat ?? (config.minLat + config.maxLat) / 2;
  const lon = business.lon ?? (config.minLon + config.maxLon) / 2;

  const tagged =
    pick(business.addrSuburb, "suburb") ??
    pick(business.addrNeighbourhood, "neighbourhood") ??
    pick(business.tags["addr:quarter"], "quarter") ??
    pick(business.tags["addr:district"], "district");

  if (tagged) {
    return { ...tagged, centerLat: lat, centerLon: lon };
  }

  const place = nearestPlace(places, lat, lon);
  if (place) {
    return {
      derivationKey: `place:${place.osmType}:${place.osmId}`,
      name: place.name,
      source: "osm_place",
      centerLat: place.lat,
      centerLon: place.lon,
    };
  }

  return gridZone(config, lat, lon);
}

function pick(value: string | null | undefined, tagName: string) {
  if (!value) return null;
  const trimmed = value.trim();
  const slug = slugify(trimmed);
  if (!slug) return null;
  return {
    derivationKey: `tag:${tagName}:${slug}`,
    name: trimmed,
    source: "osm_tag" as const,
  };
}
