import type { BoundingBox } from "../geo/bbox";
import { userAgent } from "./user-agent";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

/** Nominatim's usage policy allows at most 1 request per second. */
const MIN_REQUEST_INTERVAL_MS = 1_100;

let lastRequestAt = 0;

export type GeocodedPlace = {
  displayName: string;
  osmType: string;
  osmId: number;
  lat: number;
  lon: number;
  bbox: BoundingBox;
};

/**
 * Looks up a city's bounding box. Only needed when adding a new city; the
 * crawler itself never calls Nominatim.
 */
export async function geocodeCity(city: string, country: string): Promise<GeocodedPlace | null> {
  const waitMs = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("city", city);
  url.searchParams.set("country", country);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: { "User-Agent": userAgent(), Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status} for ${city}, ${country}`);
  }

  const results = (await response.json()) as Array<{
    display_name: string;
    osm_type: string;
    osm_id: number;
    lat: string;
    lon: string;
    // [minLat, maxLat, minLon, maxLon] as strings
    boundingbox: [string, string, string, string];
  }>;

  const match = results[0];
  if (!match) return null;

  const [minLat, maxLat, minLon, maxLon] = match.boundingbox.map(Number);
  return {
    displayName: match.display_name,
    osmType: match.osm_type,
    osmId: match.osm_id,
    lat: Number(match.lat),
    lon: Number(match.lon),
    bbox: { minLat: minLat!, maxLat: maxLat!, minLon: minLon!, maxLon: maxLon! },
  };
}
