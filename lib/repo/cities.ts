import { query, queryOne } from "../db";
import type { BoundingBox } from "../geo/bbox";

export type City = {
  id: number;
  slug: string;
  name: string;
  countryCode: string | null;
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
  cellSizeKm: number;
  zoneSizeKm: number;
  isActive: boolean;
};

type CityRow = {
  id: number;
  slug: string;
  name: string;
  country_code: string | null;
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
  cell_size_km: number;
  zone_size_km: number;
  is_active: boolean;
};

function toCity(row: CityRow): City {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    countryCode: row.country_code,
    minLat: row.min_lat,
    minLon: row.min_lon,
    maxLat: row.max_lat,
    maxLon: row.max_lon,
    cellSizeKm: row.cell_size_km,
    zoneSizeKm: row.zone_size_km,
    isActive: row.is_active,
  };
}

const SELECT_CITY = `
  select id, slug, name, country_code, min_lat, min_lon, max_lat, max_lon,
         cell_size_km, zone_size_km, is_active
  from cities
`;

export async function listCities(): Promise<City[]> {
  const rows = await query<CityRow>(`${SELECT_CITY} order by name`);
  return rows.map(toCity);
}

export async function getCityBySlug(slug: string): Promise<City | null> {
  const row = await queryOne<CityRow>(`${SELECT_CITY} where slug = $1`, [slug]);
  return row ? toCity(row) : null;
}

export function cityBbox(city: City): BoundingBox {
  return { minLat: city.minLat, minLon: city.minLon, maxLat: city.maxLat, maxLon: city.maxLon };
}

export async function upsertCity(input: {
  slug: string;
  name: string;
  countryCode: string | null;
  bbox: BoundingBox;
  cellSizeKm?: number;
  zoneSizeKm?: number;
}): Promise<City> {
  const row = await queryOne<CityRow>(
    `
    insert into cities (slug, name, country_code, min_lat, min_lon, max_lat, max_lon, cell_size_km, zone_size_km)
    values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 2), coalesce($9, 0.7))
    on conflict (slug) do update set
      name = excluded.name,
      country_code = excluded.country_code,
      min_lat = excluded.min_lat,
      min_lon = excluded.min_lon,
      max_lat = excluded.max_lat,
      max_lon = excluded.max_lon,
      cell_size_km = excluded.cell_size_km,
      zone_size_km = excluded.zone_size_km
    returning id, slug, name, country_code, min_lat, min_lon, max_lat, max_lon,
              cell_size_km, zone_size_km, is_active
    `,
    [
      input.slug,
      input.name,
      input.countryCode,
      input.bbox.minLat,
      input.bbox.minLon,
      input.bbox.maxLat,
      input.bbox.maxLon,
      input.cellSizeKm ?? null,
      input.zoneSizeKm ?? null,
    ],
  );
  return toCity(row!);
}
