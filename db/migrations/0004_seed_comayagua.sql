-- Comayagua urban core.
--
-- Nominatim's municipality boundary for Comayagua is ~1,350 km² of mostly rural
-- land (hundreds of Overpass cells). We seed a ~12×13 km box around the historic
-- centre instead — comparable to Tegucigalpa's crawl, ~49 cells at 2 km.
insert into cities (slug, name, country_code, min_lat, min_lon, max_lat, max_lon, cell_size_km, zone_size_km)
values ('comayagua', 'Comayagua', 'HN', 14.400, -87.700, 14.510, -87.580, 2, 0.7)
on conflict (slug) do nothing;
