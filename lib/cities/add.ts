import { areaKm2, clampBBoxForCrawl } from "../geo/bbox";
import { geocodeCity } from "../osm/nominatim";
import { upsertCity, type City } from "../repo/cities";
import { slugify } from "../zones/derive";
import { splitIntoCells } from "../geo/grid";

export type AddCityInput = {
  name: string;
  country: string;
  countryCode?: string | null;
  cellSizeKm?: number;
};

export type AddCityResult = {
  city: City;
  displayName: string;
  areaKm2: number;
  cells: number;
  clamped: boolean;
};

/**
 * Geocodes a place and stores it as a crawl target. Oversized municipality
 * boxes are clamped to an urban square so the first crawl stays practical.
 */
export async function addCityFromName(input: AddCityInput): Promise<AddCityResult> {
  const name = input.name.trim();
  const country = input.country.trim() || "Honduras";
  if (!name) throw new Error("City name is required");

  const place = await geocodeCity(name, country);
  if (!place) throw new Error(`No match found for "${name}, ${country}"`);

  const rawArea = areaKm2(place.bbox);
  const bbox = clampBBoxForCrawl(place.bbox);
  const clamped = areaKm2(bbox) < rawArea - 1;
  const cellSizeKm = input.cellSizeKm ?? 2;
  const cells = splitIntoCells(bbox, cellSizeKm);

  const city = await upsertCity({
    slug: slugify(name),
    name,
    countryCode: input.countryCode ?? (country.toLowerCase() === "honduras" ? "HN" : null),
    bbox,
    cellSizeKm,
  });

  return {
    city,
    displayName: place.displayName,
    areaKm2: areaKm2(bbox),
    cells: cells.length,
    clamped,
  };
}