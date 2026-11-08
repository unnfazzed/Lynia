import type { ShopShareCardResponse, ShopShareResolveResponse } from "@lynia/shared";
import { apiFetch } from "./client";

/** Shop share links (ledger D-129). `GET /share/:code` (signed in): which store the link opens. 404 = not available. */
export function resolveShopLink(code: string): Promise<ShopShareResolveResponse> {
  return apiFetch(`/share/${encodeURIComponent(code)}`);
}

/** `GET /share/:code/card` (public): a live shop's name, logo and cover, for the "Taking you to" chip. */
export function getShopCard(code: string): Promise<ShopShareCardResponse> {
  return apiFetch(`/share/${encodeURIComponent(code)}/card`, { auth: false });
}
