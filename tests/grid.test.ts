import assert from "node:assert/strict";
import { test } from "node:test";

import { areaKm2, contains } from "../lib/geo/bbox";
import { splitIntoCells } from "../lib/geo/grid";
import { MAX_QUERY_AREA_KM2, assertQueryableArea, buildBusinessQuery } from "../lib/osm/overpass";

/** Tegucigalpa, from Nominatim relation 3850824. */
const TEGUCIGALPA = { minLat: 14.0068238, minLon: -87.2807992, maxLat: 14.1422032, maxLon: -87.1327733 };

test("city bbox is far too large for a single Overpass query", () => {
  assert.ok(areaKm2(TEGUCIGALPA) > 200);
  assert.throws(() => assertQueryableArea(TEGUCIGALPA), /Refusing to query/);
});

test("2 km cells cover the city and each one is small enough to query", () => {
  const cells = splitIntoCells(TEGUCIGALPA, 2);

  assert.ok(cells.length > 1);
  for (const cell of cells) {
    assert.ok(areaKm2(cell) <= MAX_QUERY_AREA_KM2);
    assert.doesNotThrow(() => assertQueryableArea(cell));
  }

  const covered = cells.reduce((sum, cell) => sum + areaKm2(cell), 0);
  // Cells are clamped to the bbox, so the total should match it closely.
  assert.ok(Math.abs(covered - areaKm2(TEGUCIGALPA)) / areaKm2(TEGUCIGALPA) < 0.01);
});

test("cells stay inside the city bbox and every point falls in one", () => {
  const cells = splitIntoCells(TEGUCIGALPA, 2);

  for (const cell of cells) {
    assert.ok(cell.minLat >= TEGUCIGALPA.minLat && cell.maxLat <= TEGUCIGALPA.maxLat);
    assert.ok(cell.minLon >= TEGUCIGALPA.minLon && cell.maxLon <= TEGUCIGALPA.maxLon);
  }

  const probes = [
    { lat: 14.0908, lon: -87.2011 },
    { lat: TEGUCIGALPA.minLat, lon: TEGUCIGALPA.minLon },
    { lat: 14.14, lon: -87.14 },
  ];
  for (const probe of probes) {
    const matches = cells.filter((cell) => contains(cell, probe.lat, probe.lon));
    // Shared edges mean a probe can sit in more than one cell; the crawler
    // dedupes by OSM id, so overlap is fine as long as nothing is missed.
    assert.ok(matches.length >= 1, `no cell contains ${JSON.stringify(probe)}`);
  }
});

test("indices are unique and sequential", () => {
  const cells = splitIntoCells(TEGUCIGALPA, 2);
  assert.deepEqual(
    cells.map((cell) => cell.idx),
    cells.map((_, index) => index),
  );
});

test("absurd cell sizes are rejected rather than producing a huge grid", () => {
  assert.throws(() => splitIntoCells(TEGUCIGALPA, 0.01), /above the 2000 cap/);
  assert.throws(() => splitIntoCells(TEGUCIGALPA, 0), /must be positive/);
});

test("the query asks Overpass for tags plus a single centre coordinate", () => {
  const query = buildBusinessQuery({ minLat: 14, minLon: -87.2, maxLat: 14.01, maxLon: -87.19 });

  assert.match(query, /^\[out:json\]\[timeout:60\];/);
  assert.match(query, /out tags center;$/);
  for (const tag of ["healthcare", "shop", "craft", "office", "amenity", "tourism"]) {
    assert.ok(query.includes(`nwr["${tag}"`), `missing ${tag} clause`);
  }
  // bbox order is south,west,north,east.
  assert.ok(query.includes("(14,-87.2,14.01,-87.19)"));
});
