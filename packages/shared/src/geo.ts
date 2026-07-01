/**
 * Coarse geo-cell scoping for the live rider board (a pilot-scale stand-in for geohash: cheap,
 * exact, and trivial to compute the 8 neighbours of — no border-wrap tables to get wrong).
 *
 * A new order is pushed to its pickup's single cell; a rider joins its own cell + the 8 around it
 * (a 3×3 neighbourhood). So an order whose pickup is up to ~one cell away still lands in a room the
 * rider is in — matching the ~5 km REST board radius. The 15 s REST poll self-heals any boundary miss.
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
