import assert from "node:assert/strict";
import { test } from "node:test";

import type { OsmPlace } from "../lib/osm/places";
import { MAX_PLACE_DISTANCE_KM, deriveZone, gridZoneIndex, nearestPlace, rowLabel, slugify } from "../lib/zones/derive";

const PLACES: OsmPlace[] = [
  { osmType: "node", osmId: 1, name: "Colonia Kennedy", placeType: "neighbourhood", lat: 14.0705, lon: -87.1817 },
  { osmType: "node", osmId: 2, name: "Palmira", placeType: "neighbourhood", lat: 14.0965, lon: -87.1938 },
  { osmType: "node", osmId: 3, name: "Barrio La Leona", placeType: "quarter", lat: 14.1046, lon: -87.2078 },
];

const CONFIG = {
  minLat: 14.0068238,
  minLon: -87.2807992,
  maxLat: 14.1422032,
  maxLon: -87.1327733,
  zoneSizeKm: 0.7,
};

function business(overrides: Partial<Parameters<typeof deriveZone>[0]> = {}) {
  return {
    addrSuburb: null,
    addrNeighbourhood: null,
    lat: 14.09,
    lon: -87.2,
    tags: {} as Record<string, string>,
    ...overrides,
  };
}

test("addr:suburb wins over the fallback grid", () => {
  const zone = deriveZone(business({ addrSuburb: "Barrio La Hoya" }), CONFIG);
  assert.equal(zone.source, "osm_tag");
  assert.equal(zone.name, "Barrio La Hoya");
  assert.equal(zone.derivationKey, "tag:suburb:barrio-la-hoya");
});

test("addr:neighbourhood is used when there is no suburb", () => {
  const zone = deriveZone(business({ addrNeighbourhood: "Colonia Palmira" }), CONFIG);
  assert.equal(zone.derivationKey, "tag:neighbourhood:colonia-palmira");
});

test("suburb takes precedence over neighbourhood", () => {
  const zone = deriveZone(business({ addrSuburb: "Comayagüela", addrNeighbourhood: "Colonia Palmira" }), CONFIG);
  assert.equal(zone.derivationKey, "tag:suburb:comayaguela");
});

test("accents and punctuation normalise to one stable key", () => {
  assert.equal(slugify("Comayagüela"), "comayaguela");
  assert.equal(slugify("  Col. Kennedy  "), "col-kennedy");
  assert.equal(
    deriveZone(business({ addrSuburb: "Comayagüela" }), CONFIG).derivationKey,
    deriveZone(business({ addrSuburb: "comayaguela" }), CONFIG).derivationKey,
  );
});

test("untagged businesses fall back to a named grid square when there are no places", () => {
  const zone = deriveZone(business(), CONFIG);
  assert.equal(zone.source, "grid");
  assert.match(zone.derivationKey, /^grid:\d+:\d+$/);
  assert.match(zone.name, /^Grid [A-Z]+\d+$/);
});

test("untagged businesses take the name of the nearest neighbourhood", () => {
  const zone = deriveZone(business({ lat: 14.0968, lon: -87.1941 }), CONFIG, PLACES);
  assert.equal(zone.source, "osm_place");
  assert.equal(zone.name, "Palmira");
  assert.equal(zone.derivationKey, "place:node:2");
});

test("a business far from every neighbourhood still falls back to the grid", () => {
  // Deep in the rural south of the bbox, kilometres from any place node.
  const zone = deriveZone(business({ lat: 14.0100, lon: -87.2700 }), CONFIG, PLACES);
  assert.equal(zone.source, "grid");
});

test("an addr: tag outranks a nearby neighbourhood", () => {
  const zone = deriveZone(business({ addrSuburb: "Comayagüela", lat: 14.0965, lon: -87.1938 }), CONFIG, PLACES);
  assert.equal(zone.source, "osm_tag");
  assert.equal(zone.name, "Comayagüela");
});

test("nearest place respects the distance cap", () => {
  assert.equal(nearestPlace(PLACES, 14.0965, -87.1938)?.name, "Palmira");
  assert.equal(nearestPlace(PLACES, 14.5, -87.9), null);
  assert.equal(nearestPlace([], 14.0965, -87.1938), null);
});

test("the place distance cap is a neighbourhood-sized radius", () => {
  assert.ok(MAX_PLACE_DISTANCE_KM > 0.3 && MAX_PLACE_DISTANCE_KM < 3);
});

test("a place zone keeps the same key however many businesses land in it", () => {
  const a = deriveZone(business({ lat: 14.0960, lon: -87.1930 }), CONFIG, PLACES);
  const b = deriveZone(business({ lat: 14.0970, lon: -87.1945 }), CONFIG, PLACES);
  assert.equal(a.derivationKey, b.derivationKey);
});

test("nearby businesses share a grid zone and distant ones do not", () => {
  const a = deriveZone(business({ lat: 14.0900, lon: -87.2000 }), CONFIG);
  const b = deriveZone(business({ lat: 14.0905, lon: -87.2005 }), CONFIG);
  const far = deriveZone(business({ lat: 14.1300, lon: -87.1500 }), CONFIG);

  assert.equal(a.derivationKey, b.derivationKey);
  assert.notEqual(a.derivationKey, far.derivationKey);
});

test("grid assignment is stable across crawls for the same config", () => {
  const first = gridZoneIndex(CONFIG, 14.0913, -87.2043);
  const second = gridZoneIndex(CONFIG, 14.0913, -87.2043);
  assert.deepEqual(first, second);
});

test("grid zone centres land inside their own square", () => {
  const zone = deriveZone(business({ lat: 14.0913, lon: -87.2043 }), CONFIG);
  const index = gridZoneIndex(CONFIG, zone.centerLat, zone.centerLon);
  assert.deepEqual(index, gridZoneIndex(CONFIG, 14.0913, -87.2043));
});

test("row labels continue past Z", () => {
  assert.equal(rowLabel(0), "A");
  assert.equal(rowLabel(25), "Z");
  assert.equal(rowLabel(26), "AA");
});

test("empty or symbol-only tags fall through to the grid", () => {
  assert.equal(deriveZone(business({ addrSuburb: "   " }), CONFIG).source, "grid");
  assert.equal(deriveZone(business({ addrSuburb: "---" }), CONFIG).source, "grid");
});
