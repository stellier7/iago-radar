import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_TEMPLATE_KEY, TEMPLATES, templateForNiche, templateLabel } from "../lib/templates/registry";

test("today's three templates match their niches", () => {
  assert.equal(templateForNiche("healthcare:dentist"), "dentist");
  assert.equal(templateForNiche("amenity:dentist"), "dentist");
  assert.equal(templateForNiche("amenity:cafe"), "coffee_shop");
  assert.equal(templateForNiche("shop:coffee"), "coffee_shop");
  assert.equal(templateForNiche("shop:hairdresser"), "beauty_salon");
  assert.equal(templateForNiche("shop:beauty"), "beauty_salon");
});

test("unmatched niches fall into the default bucket instead of being dropped", () => {
  assert.equal(templateForNiche("shop:bakery"), DEFAULT_TEMPLATE_KEY);
  assert.equal(templateForNiche("office:lawyer"), DEFAULT_TEMPLATE_KEY);
  assert.equal(templateForNiche("tourism:hotel"), DEFAULT_TEMPLATE_KEY);
  assert.equal(templateForNiche("something:we:never:saw"), DEFAULT_TEMPLATE_KEY);
});

test("no niche is claimed by two templates", () => {
  const seen = new Set<string>();
  for (const template of TEMPLATES) {
    for (const niche of template.niches) {
      assert.ok(!seen.has(niche), `${niche} is mapped twice`);
      seen.add(niche);
    }
  }
});

test("every template key is unique and labelled", () => {
  const keys = TEMPLATES.map((template) => template.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.notEqual(templateLabel(key), key);
});

test("the default template exists", () => {
  assert.ok(TEMPLATES.some((template) => template.key === DEFAULT_TEMPLATE_KEY));
});
