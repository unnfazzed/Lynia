/**
 * Coarse geo-cell scoping for the live rider board (a pilot-scale stand-in for geohash: cheap,
 * exact, and trivial to compute the 8 neighbours of — no border-wrap tables to get wrong).
 *
 * A new order is pushed to its pickup's single cell; a rider joins its own cell + the 8 around it
 * (a 3×3 neighbourhood). So an order whose pickup is up to ~one cell away still lands in a room the
 * rider is in — matching the base broadcast radius (policy BROADCAST.baseRadiusM) the REST board
 * defaults to. Widening-broadcast ticks push to the larger cell set from boardCellsCoveringRadius.
 * The 15 s REST poll self-heals any boundary miss.
 */

/** Cell edge length in degrees (~5 km of latitude at Harare). One source for push + subscribe. */
export const BOARD_CELL_DEG = 0.045;

function cellIndices(lat: number, lng: number): { r: number; c: number } {
  return { r: Math.floor(lat / BOARD_CELL_DEG), c: Math.floor(lng / BOARD_CELL_DEG) };
}

/** The single cell a point falls in — used to target a new-order push. */
export function boardCell(lat: number, lng: number): string {
  const { r, c } = cellIndices(lat, lng);
  return `${r}:${c}`;
}

/** A point's cell + its 8 neighbours (3×3), deduped — the rooms a rider at that point subscribes to. */
export function boardCellNeighborhood(lat: number, lng: number): string[] {
  const { r, c } = cellIndices(lat, lng);
  const cells: string[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      cells.push(`${r + dr}:${c + dc}`);
    }
  }
  return cells;
}

/** Metres per degree of latitude (and of longitude at the equator). */
const M_PER_DEG = 111_320;

/**
 * Every cell whose bounding box intersects a disc of `radiusM` around the point — generalizes the
 * 3×3 neighbourhood for the widening broadcast (policy BROADCAST.expansion), where an order must
 * reach rooms more than one cell away. Uses the disc's lat/lng bounding box, so it over-covers the
 * corners slightly; harmless — an extra room just means an extra (client-deduped) card push.
 */
export function boardCellsCoveringRadius(lat: number, lng: number, radiusM: number): string[] {
  const latDeg = radiusM / M_PER_DEG;
  // Longitude degrees shrink with cos(lat); clamp the divisor so polar inputs can't explode the box.
  const lngDeg = radiusM / (M_PER_DEG * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  const rMin = Math.floor((lat - latDeg) / BOARD_CELL_DEG);
  const rMax = Math.floor((lat + latDeg) / BOARD_CELL_DEG);
  const cMin = Math.floor((lng - lngDeg) / BOARD_CELL_DEG);
  const cMax = Math.floor((lng + lngDeg) / BOARD_CELL_DEG);
  const cells: string[] = [];
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      cells.push(`${r}:${c}`);
    }
  }
  return cells;
}
