export type BoundingBox = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};

/** Metres per degree of latitude, near enough for grid maths at city scale. */
const KM_PER_LAT_DEGREE = 111.32;

export function kmToLatDegrees(km: number): number {
  return km / KM_PER_LAT_DEGREE;
}

/** Longitude degrees shrink towards the poles, so this needs a latitude. */
export function kmToLonDegrees(km: number, atLat: number): number {
  const scale = Math.cos((atLat * Math.PI) / 180);
  // Guard against division by ~0 at the poles; no city we target is up there.
  return km / (KM_PER_LAT_DEGREE * Math.max(scale, 0.01));
}

export function centerOf(bbox: BoundingBox): { lat: number; lon: number } {
  return {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lon: (bbox.minLon + bbox.maxLon) / 2,
  };
}

export function areaKm2(bbox: BoundingBox): number {
  const meanLat = (bbox.minLat + bbox.maxLat) / 2;
  const heightKm = (bbox.maxLat - bbox.minLat) * KM_PER_LAT_DEGREE;
  const widthKm = (bbox.maxLon - bbox.minLon) * KM_PER_LAT_DEGREE * Math.cos((meanLat * Math.PI) / 180);
  return Math.abs(heightKm * widthKm);
}

/** Great-circle distance in kilometres. */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const earthRadiusKm = 6371;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function contains(bbox: BoundingBox, lat: number, lon: number): boolean {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}
