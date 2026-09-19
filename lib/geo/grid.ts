import { kmToLatDegrees, kmToLonDegrees, type BoundingBox } from "./bbox";

export type GridCell = BoundingBox & {
  idx: number;
  row: number;
  col: number;
};

/**
 * Sanity cap. Tegucigalpa at 2 km cells is ~70 cells; four figures means
 * someone passed metres instead of kilometres.
 */
const MAX_CELLS = 2_000;

/**
 * Splits a city bounding box into row-major cells of roughly `cellSizeKm` a
 * side. Each cell becomes exactly one Overpass request.
 */
export function splitIntoCells(bbox: BoundingBox, cellSizeKm: number): GridCell[] {
  if (!(cellSizeKm > 0)) throw new Error(`cellSizeKm must be positive, got ${cellSizeKm}`);

  const meanLat = (bbox.minLat + bbox.maxLat) / 2;
  const latStep = kmToLatDegrees(cellSizeKm);
  const lonStep = kmToLonDegrees(cellSizeKm, meanLat);

  const rows = Math.max(1, Math.ceil((bbox.maxLat - bbox.minLat) / latStep));
  const cols = Math.max(1, Math.ceil((bbox.maxLon - bbox.minLon) / lonStep));

  if (rows * cols > MAX_CELLS) {
    throw new Error(
      `Grid would be ${rows}x${cols} = ${rows * cols} cells, above the ${MAX_CELLS} cap. ` +
        "Use a larger cell size or a smaller bounding box.",
    );
  }

  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        idx: cells.length,
        row,
        col,
        minLat: bbox.minLat + row * latStep,
        minLon: bbox.minLon + col * lonStep,
        // Clamp so the last row/column does not spill past the city bbox.
        maxLat: Math.min(bbox.maxLat, bbox.minLat + (row + 1) * latStep),
        maxLon: Math.min(bbox.maxLon, bbox.minLon + (col + 1) * lonStep),
      });
    }
  }
  return cells;
}
