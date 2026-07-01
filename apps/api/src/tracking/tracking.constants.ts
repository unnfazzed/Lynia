/** Socket.IO room a customer/rider joins to receive an order's live position + status. */
export function orderRoom(orderId: string): string {
  return `order:${orderId}`;
}

/** The single global room verified + online riders join to receive new-order board pushes. This is
 *  the city-wide fallback for loc-less riders; geo-scoped riders join boardGeoRoom cells instead. */
export const BOARD_ROOM = "board";

/** Per geo-cell board room — a rider scopes its board subscription to its cell neighbourhood, and a
 *  new order is pushed to its pickup cell. See packages/shared/src/geo.ts for the cell scheme. */
export function boardGeoRoom(cell: string): string {
  return `board:geo:${cell}`;
}

/** Accept either a raw access token or an "Authorization: Bearer <token>" header value. */
export function parseBearer(header?: string): string | undefined {
  if (!header) return undefined;
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
}
