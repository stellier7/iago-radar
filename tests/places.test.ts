import assert from "node:assert/strict";
import { test } from "node:test";

import { areaKm2, distanceKm } from "../lib/geo/bbox";
import { splitIntoCells } from "../lib/geo/grid";
import { PLACE_CELL_SIZE_KM, PLACE_TYPES, buildPlacesQuery } from "../lib/osm/places";

const TEGUCIGALPA = { minLat: 14.0068238, minLon: -87.2807992, maxLat: 14.1422032, maxLon: -87.1327733 };

test("the gazetteer query asks only for named neighbourhood-like places", () => {
  const query = buildPlacesQuery({ minLat: 14, minLon: -87.2, maxLat: 14.05, maxLon: -87.15 });

  assert.match(query, /^\[out:json\]\[timeout:60\];/);
  assert.match(query, /out tags center;$/);
  assert.ok(query.includes('["name"]'), "unnamed places are useless as zone names");
  for (const placeType of PLACE_TYPES) assert.ok(query.includes(placeType), `missing ${placeType}`);
  assert.ok(query.includes("(14,-87.2,14.05,-87.15)"));
});

test("the gazetteer sweep is chunked too, not one whole-city query", () => {
  const cells = splitIntoCells(TEGUCIGALPA, PLACE_CELL_SIZE_KM);

  assert.ok(cells.length > 1, "a single 241 km2 place query times out on overpass-api.de");
  // Cheap enough to use bigger cells than the business grid, but still bounded.
  assert.ok(cells.length <= 9, `${cells.length} gazetteer requests per run is too many`);
  for (const cell of cells) assert.ok(areaKm2(cell) <= 100);
});

test("distances between known Tegucigalpa points are plausible", () => {
  // Centro to Colonia Kennedy is roughly 4 km.
  const km = distanceKm(14.1015, -87.2065, 14.0705, -87.1817);
  assert.ok(km > 3 && km < 6, `expected 3-6 km, got ${km.toFixed(2)}`);
  assert.equal(distanceKm(14.1, -87.2, 14.1, -87.2), 0);
});
