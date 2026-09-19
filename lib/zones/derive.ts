import { kmToLatDegrees, kmToLonDegrees, type BoundingBox } from "../geo/bbox";
import type { NormalizedBusiness } from "../osm/normalize";

export type ZoneAssignment = {
  /** Stable identity for the zone. Renaming a zone must not change this. */
  derivationKey: string;
  name: string;
  source: "osm_tag" | "grid";
  centerLat: number;
  centerLon: number;
};

export type ZoneGridConfig = BoundingBox & {
  zoneSizeKm: number;
};

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
 * Zone for a business: its OSM neighbourhood tag when it has one, otherwise the
 * fallback grid square. Grid zones are meant to be renamed and merged by hand
 * once you recognise the area.
 */
export function deriveZone(
  business: Pick<NormalizedBusiness, "addrSuburb" | "addrNeighbourhood" | "lat" | "lon" | "tags">,
  config: ZoneGridConfig,
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
