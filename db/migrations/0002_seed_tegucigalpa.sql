-- Phase 1 target city.
--
-- Bounding box from Nominatim (relation 3850824, "Tegucigalpa, Distrito
-- Central"). It is a rectangle, so it also covers Comayaguela on the west bank
-- of the Choluteca - which is what we want for outreach.
--
-- 15 x 16 km, roughly 240 km2. At cell_size_km = 2 that is a 8 x 8 grid of
-- ~4 km2 Overpass queries. Do not raise cell_size_km much above 3: the whole
-- box in one query times out.
insert into cities (slug, name, country_code, min_lat, min_lon, max_lat, max_lon, cell_size_km, zone_size_km)
values ('tegucigalpa', 'Tegucigalpa', 'HN', 14.0068238, -87.2807992, 14.1422032, -87.1327733, 2, 0.7)
on conflict (slug) do nothing;
