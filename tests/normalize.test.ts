import assert from "node:assert/strict";
import { test } from "node:test";

import { classify } from "../lib/osm/categories";
import { dedupeByOsmId, normalizeElement } from "../lib/osm/normalize";
import type { OverpassElement } from "../lib/osm/overpass";

function node(tags: Record<string, string>, id = 1): OverpassElement {
  return { type: "node", id, lat: 14.09, lon: -87.2, tags };
}

test("classifies the tags we crawl for", () => {
  assert.deepEqual(classify({ shop: "bakery" })?.nicheKey, "shop:bakery");
  assert.deepEqual(classify({ amenity: "cafe" })?.nicheKey, "amenity:cafe");
  assert.deepEqual(classify({ office: "lawyer" })?.nicheKey, "office:lawyer");
  assert.deepEqual(classify({ craft: "carpenter" })?.nicheKey, "craft:carpenter");
  assert.deepEqual(classify({ tourism: "hotel" })?.nicheKey, "tourism:hotel");
});

test("prefers the more specific key when several are present", () => {
  assert.equal(classify({ amenity: "dentist", healthcare: "dentist" })?.nicheKey, "healthcare:dentist");
  assert.equal(classify({ shop: "chemist", healthcare: "pharmacy" })?.nicheKey, "healthcare:pharmacy");
});

test("the same trade tagged two ways lands on one niche", () => {
  // Tegucigalpa has ~66 amenity=pharmacy and ~66 healthcare=pharmacy.
  assert.equal(classify({ amenity: "pharmacy" })?.nicheKey, "healthcare:pharmacy");
  assert.equal(classify({ healthcare: "pharmacy" })?.nicheKey, "healthcare:pharmacy");
  assert.equal(classify({ amenity: "doctors" })?.nicheKey, "healthcare:doctor");
  assert.equal(classify({ healthcare: "doctors" })?.nicheKey, "healthcare:doctor");
});

test("an aliased niche keeps the original tag for auditing", () => {
  const classification = classify({ amenity: "pharmacy" });
  assert.equal(classification?.primaryTag, "amenity");
  assert.equal(classification?.primaryValue, "pharmacy");
  assert.equal(classification?.nicheKey, "healthcare:pharmacy");
});

test("shop=yes reads as unspecified rather than 'Yes'", () => {
  assert.equal(classify({ shop: "yes" })?.nicheLabel, "Unspecified shop");
  assert.equal(classify({ office: "yes" })?.nicheLabel, "Unspecified office");
  assert.equal(classify({ shop: "bakery" })?.nicheLabel, "Bakery (Shop)");
  assert.equal(classify({ shop: "car_repair" })?.nicheLabel, "Car Repair (Shop)");
});

test("skips non-business amenities and non-lodging tourism", () => {
  assert.equal(classify({ amenity: "bench" }), null);
  assert.equal(classify({ amenity: "bus_station" }), null);
  assert.equal(classify({ tourism: "viewpoint" }), null);
  assert.equal(classify({ tourism: "artwork" }), null);
});

test("skips closed and disused objects", () => {
  assert.equal(classify({ shop: "vacant" }), null);
  assert.equal(classify({ shop: "no" }), null);
  assert.equal(classify({ "disused:shop": "bakery" }), null);
  assert.equal(classify({ shop: "bakery", "disused:amenity": "cafe" }), null);
});

test("handles multi-valued tags by taking the first value", () => {
  assert.equal(classify({ shop: "hairdresser;beauty" })?.nicheKey, "shop:hairdresser");
});

test("extracts contact details from both bare and contact: prefixed tags", () => {
  const business = normalizeElement(
    node({
      shop: "bakery",
      name: "Panadería La Esperanza",
      "contact:phone": "+504 2234-5678",
      "contact:email": "hola@example.hn",
      opening_hours: "Mo-Sa 07:00-19:00",
      "addr:street": "Avenida Cervantes",
      "addr:housenumber": "1420",
      "addr:suburb": "Barrio La Hoya",
    }),
  );

  assert.ok(business);
  assert.equal(business.name, "Panadería La Esperanza");
  assert.equal(business.phone, "+504 2234-5678");
  assert.equal(business.email, "hola@example.hn");
  assert.equal(business.openingHours, "Mo-Sa 07:00-19:00");
  assert.equal(business.addrSuburb, "Barrio La Hoya");
  assert.equal(business.hasWebsite, false);
});

test("a real website counts as having a site", () => {
  const business = normalizeElement(node({ amenity: "cafe", website: "example.hn/cafe" }));
  assert.equal(business?.hasWebsite, true);
  assert.equal(business?.website, "https://example.hn/cafe");
});

test("a Facebook page in the website tag is a social profile, not a website", () => {
  const business = normalizeElement(node({ amenity: "cafe", website: "https://www.facebook.com/cafetegucigalpa" }));

  assert.equal(business?.hasWebsite, false, "a Facebook page should leave them a prospect");
  assert.equal(business?.website, null);
  assert.equal(business?.socials.facebook, "https://www.facebook.com/cafetegucigalpa");
});

test("placeholder tag values are ignored", () => {
  const business = normalizeElement(node({ shop: "bakery", website: "no", phone: "yes" }));
  assert.equal(business?.website, null);
  assert.equal(business?.phone, null);
  assert.equal(business?.hasWebsite, false);
});

test("ways and relations are located by their centre", () => {
  const business = normalizeElement({
    type: "way",
    id: 42,
    center: { lat: 14.1, lon: -87.21 },
    tags: { shop: "supermarket" },
  });

  assert.equal(business?.lat, 14.1);
  assert.equal(business?.osmType, "way");
});

test("elements without a location are dropped", () => {
  assert.equal(normalizeElement({ type: "way", id: 7, tags: { shop: "bakery" } }), null);
});

test("unnamed businesses are kept", () => {
  const business = normalizeElement(node({ shop: "hairdresser" }));
  assert.ok(business);
  assert.equal(business.name, null);
});

test("dedupe keeps one row per OSM id and prefers the richer copy", () => {
  const sparse = normalizeElement(node({ shop: "bakery" }, 99))!;
  const rich = normalizeElement(node({ shop: "bakery", name: "Two", phone: "123" }, 99))!;

  const deduped = dedupeByOsmId([sparse, rich]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]!.name, "Two");
});

test("the same OSM id as a node and a way are different businesses", () => {
  const asNode = normalizeElement(node({ shop: "bakery" }, 5))!;
  const asWay = normalizeElement({ type: "way", id: 5, center: { lat: 14, lon: -87 }, tags: { shop: "bakery" } })!;

  assert.equal(dedupeByOsmId([asNode, asWay]).length, 2);
});
