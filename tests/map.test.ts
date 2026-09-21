import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { viewportFromBBox, viewportFromMarkers } from "../lib/ui/map";

describe("viewportFromBBox", () => {
  it("centers on the bounding box", () => {
    const view = viewportFromBBox({ minLat: 14.0, minLon: -87.3, maxLat: 14.2, maxLon: -87.1 }, 12);
    assert.equal(view.centerLat, 14.1);
    assert.ok(Math.abs(view.centerLon - -87.2) < 0.0001);
    assert.equal(view.zoom, 12);
  });
});

describe("viewportFromMarkers", () => {
  const fallback = { centerLat: 14.1, centerLon: -87.2, zoom: 11 };

  it("falls back when there are no markers", () => {
    assert.deepEqual(viewportFromMarkers([], fallback), fallback);
  });

  it("zooms in for a single marker", () => {
    const view = viewportFromMarkers([{ lat: 14.08, lon: -87.19 }], fallback);
    assert.equal(view.centerLat, 14.08);
    assert.equal(view.zoom, 15);
  });

  it("fits several markers with a tighter zoom", () => {
    const view = viewportFromMarkers(
      [
        { lat: 14.08, lon: -87.19 },
        { lat: 14.09, lon: -87.18 },
      ],
      fallback,
    );
    assert.ok(view.zoom >= 14);
    assert.equal(view.centerLat, 14.085);
  });
});
