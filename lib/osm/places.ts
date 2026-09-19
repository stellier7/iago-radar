import { areaKm2, type BoundingBox } from "../geo/bbox";
import { splitIntoCells } from "../geo/grid";
import { execute, sleep, type FetchOptions, type OverpassElement } from "./overpass";

/**
 * Neighbourhood-ish place values, most specific first. Honduran neighbourhoods
 * ("Colonia Kennedy", "Barrio La Leona") are mapped as `place=neighbourhood` or
 * `place=quarter`.
 */
export const PLACE_TYPES = ["neighbourhood", "quarter", "suburb", "borough", "city_block"] as const;

/**
 * Cell size for the gazetteer sweep. Much larger than the business grid because
 * this query has one tag clause and returns a few hundred elements, but still
 * chunked - the whole 241 km2 of Tegucigalpa in one request times out on
 * overpass-api.de even for this.
 */
export const PLACE_CELL_SIZE_KM = 8;

/** Sanity cap for one gazetteer request, matching PLACE_CELL_SIZE_KM squared plus slack. */
const MAX_PLACE_QUERY_AREA_KM2 = 100;

export type OsmPlace = {
  osmType: "node" | "way" | "relation";
  osmId: number;
  name: string;
  placeType: string;
  lat: number;
  lon: number;
};

export function buildPlacesQuery(bbox: BoundingBox, timeoutSeconds = 60): string {
  const b = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
  return [
    `[out:json][timeout:${timeoutSeconds}];`,
    `nwr["place"~"^(${PLACE_TYPES.join("|")})$"]["name"](${b});`,
    "out tags center;",
  ].join("\n");
}

function toPlace(element: OverpassElement): OsmPlace | null {
  const name = element.tags?.name?.trim();
  const placeType = element.tags?.place;
  if (!name || !placeType) return null;

  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  return { osmType: element.type, osmId: element.id, name, placeType, lat, lon };
}

/**
 * Fetches the named neighbourhoods for a city. One sweep per crawl run, not per
 * cell, so this costs a handful of Overpass requests per night.
 */
export async function fetchPlaces(bbox: BoundingBox, options: FetchOptions = {}): Promise<OsmPlace[]> {
  const cells = splitIntoCells(bbox, PLACE_CELL_SIZE_KM);
  for (const cell of cells) {
    if (areaKm2(cell) > MAX_PLACE_QUERY_AREA_KM2) {
      throw new Error(
        `Gazetteer cell of ${areaKm2(cell).toFixed(0)} km2 exceeds the ${MAX_PLACE_QUERY_AREA_KM2} km2 cap; ` +
          "lower PLACE_CELL_SIZE_KM.",
      );
    }
  }

  const byKey = new Map<string, OsmPlace>();
  for (const [index, cell] of cells.entries()) {
    if (index > 0) await sleep(1_000);
    const elements = await execute(buildPlacesQuery(cell), options);
    for (const element of elements) {
      const place = toPlace(element);
      if (place) byKey.set(`${place.osmType}/${place.osmId}`, place);
    }
  }

  return [...byKey.values()];
}
