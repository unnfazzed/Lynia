/** Socket.IO room a customer/rider joins to receive an order's live position + status. */
export function orderRoom(orderId: string): string {
  return `order:${orderId}`;
}

/** Accept either a raw access token or an "Authorization: Bearer <token>" header value. */
export function parseBearer(header?: string): string | undefined {
  if (!header) return undefined;
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
}
