-- Neighbourhood gazetteer.
--
-- Tegucigalpa businesses essentially never carry addr:suburb or
-- addr:neighbourhood (0 of 2371 in the first full crawl), but OSM does have ~400
-- named `place` nodes for the city: "Colonia Kennedy", "Barrio La Leona",
-- "Palmira". Assigning each business to its nearest named place gives zones you
-- can actually navigate by, with the grid squares left as a last resort.

create table if not exists places (
  id         bigserial primary key,
  city_id    integer not null references cities(id) on delete cascade,
  osm_type   text not null check (osm_type in ('node', 'way', 'relation')),
  osm_id     bigint not null,
  name       text not null,
  place_type text not null,
  lat        double precision not null,
  lon        double precision not null,
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);

create index if not exists places_city_idx on places (city_id);

-- Zones can now also come from a nearby named place.
alter table zones drop constraint if exists zones_source_check;
alter table zones add constraint zones_source_check check (source in ('osm_tag', 'osm_place', 'grid'));
