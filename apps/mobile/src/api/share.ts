import type { MerchantShareLinkResponse, ShopShareCardResponse, ShopShareResolveResponse } from "@lynia/shared";
import { apiFetch } from "./client";

/** Shop share links (ledger D-129). `GET /share/:code` (signed in): which store the link opens. 404 = not available. */
export function resolveShopLink(code: string): Promise<ShopShareResolveResponse> {
  return apiFetch(`/share/${encodeURIComponent(code)}`);
}

/** `GET /share/:code/card` (public): a live shop's name, logo and cover, for the "Taking you to" chip. */
export function getShopCard(code: string): Promise<ShopShareCardResponse> {
  return apiFetch(`/share/${encodeURIComponent(code)}/card`, { auth: false });
}

/** `GET /share/for/:merchantId` (signed in): a business's share link for the store's Share disc (SH-C). */
export function getShareLinkFor(merchantId: string): Promise<MerchantShareLinkResponse> {
  return apiFetch(`/share/for/${encodeURIComponent(merchantId)}`);
}
