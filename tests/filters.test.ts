import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFilters, toQueryString } from "../lib/ui/filters";

test("defaults to Tegucigalpa prospects grouped by zone", () => {
  const state = parseFilters({});
  assert.equal(state.citySlug, "tegucigalpa");
  assert.equal(state.website, "missing");
  assert.equal(state.grouped, true);
  assert.equal(state.sort, "name");
  assert.equal(state.page, 1);
  assert.deepEqual(state.zoneIds, []);
  assert.deepEqual(state.nicheKeys, []);
});

test("zone and niche filters apply together, not one after the other", () => {
  const state = parseFilters({ zone: "3,7", niche: "amenity:cafe,shop:bakery" });
  assert.deepEqual(state.zoneIds, [3, 7]);
  assert.deepEqual(state.nicheKeys, ["amenity:cafe", "shop:bakery"]);
});

test("repeated query parameters are accepted as well as comma lists", () => {
  assert.deepEqual(parseFilters({ zone: ["3", "7"] }).zoneIds, [3, 7]);
  assert.deepEqual(parseFilters({ niche: ["amenity:cafe", "shop:bakery"] }).nicheKeys, [
    "amenity:cafe",
    "shop:bakery",
  ]);
});

test("the unzoned bucket is tracked separately from zone ids", () => {
  const state = parseFilters({ zone: "none,4" });
  assert.deepEqual(state.zoneIds, [4]);
  assert.equal(state.includeNoZone, true);
});

test("junk values fall back to defaults instead of throwing", () => {
  const state = parseFilters({ web: "maybe", sort: "random", page: "-3", zone: "abc" });
  assert.equal(state.website, "missing");
  assert.equal(state.sort, "name");
  assert.equal(state.page, 1);
  assert.deepEqual(state.zoneIds, []);
});

test("serialising omits defaults so shared links stay short", () => {
  assert.equal(toQueryString(parseFilters({})), "");
  assert.equal(toQueryString(parseFilters({ web: "all" })), "web=all");
});

test("a filter state survives a round trip", () => {
  const original = parseFilters({
    zone: "3,none",
    niche: "amenity:cafe",
    tpl: "dentist",
    web: "all",
    q: "panaderia",
    named: "1",
    sort: "recent",
    group: "flat",
    page: "2",
  });

  assert.deepEqual(parseFilters(Object.fromEntries(new URLSearchParams(toQueryString(original)))), original);
});
