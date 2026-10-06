import assert from "node:assert/strict";
import { test } from "node:test";

import { areaKm2, clampBBoxForCrawl, MAX_CRAWL_AREA_KM2, squareAround } from "../lib/geo/bbox";

test("squareAround is roughly 2*halfSide on each edge", () => {
  const box = squareAround(14.45, -87.64, 7);
  const area = areaKm2(box);
  // 14 km × 14 km ≈ 196 km²; allow a little cosine distortion.
  assert.ok(area > 180 && area < 220, `area was ${area}`);
});

test("clampBBoxForCrawl leaves a city-sized box alone", () => {
  const tegucigalpa = {
    minLat: 14.0068238,
    minLon: -87.2807992,
    maxLat: 14.1422032,
    maxLon: -87.1327733,
  };
  assert.equal(areaKm2(tegucigalpa) < MAX_CRAWL_AREA_KM2, true);
  assert.deepEqual(clampBBoxForCrawl(tegucigalpa), tegucigalpa);
});

test("clampBBoxForCrawl shrinks Comayagua municipality to an urban square", () => {
  const municipality = {
    minLat: 14.3577589,
    maxLat: 14.5959664,
    minLon: -87.8735571,
    maxLon: -87.395934,
  };
  assert.ok(areaKm2(municipality) > MAX_CRAWL_AREA_KM2);
  const clamped = clampBBoxForCrawl(municipality);
  assert.ok(areaKm2(clamped) <= MAX_CRAWL_AREA_KM2);
  assert.ok(areaKm2(clamped) < areaKm2(municipality) / 2);
});
