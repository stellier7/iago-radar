import { query, type Queryable } from "../db";
import type { OsmPlace } from "../osm/places";

export async function upsertPlaces(db: Queryable, cityId: number, places: OsmPlace[]): Promise<number> {
  if (places.length === 0) return 0;

  const params: unknown[] = [];
  const tuples = places.map((place) => {
    const values = [cityId, place.osmType, place.osmId, place.name, place.placeType, place.lat, place.lon];
    const placeholders = values.map((_, i) => `$${params.length + i + 1}`);
    params.push(...values);
    return `(${placeholders.join(", ")})`;
  });

  const result = await db.query(
    `
    insert into places (city_id, osm_type, osm_id, name, place_type, lat, lon)
    values ${tuples.join(", ")}
    on conflict (osm_type, osm_id) do update set
      city_id = excluded.city_id,
      name = excluded.name,
      place_type = excluded.place_type,
      lat = excluded.lat,
      lon = excluded.lon,
      updated_at = now()
    `,
    params,
  );
  return result.rowCount ?? 0;
}

/** Newest gazetteer row for a city, or null when it has never been swept. */
export async function placesLastUpdatedAt(cityId: number): Promise<Date | null> {
  const rows = await query<{ updated_at: Date | null }>(
    "select max(updated_at) as updated_at from places where city_id = $1",
    [cityId],
  );
  return rows[0]?.updated_at ?? null;
}

export async function listPlaces(cityId: number): Promise<OsmPlace[]> {
  const rows = await query<{
    osm_type: "node" | "way" | "relation";
    osm_id: string;
    name: string;
    place_type: string;
    lat: number;
    lon: number;
  }>("select osm_type, osm_id, name, place_type, lat, lon from places where city_id = $1", [cityId]);

  return rows.map((row) => ({
    osmType: row.osm_type,
    osmId: Number(row.osm_id),
    name: row.name,
    placeType: row.place_type,
    lat: row.lat,
    lon: row.lon,
  }));
}
