import type { MerchantShareLinkResponse } from "@lynia/shared";
import { authedFetch } from "./api-client";

/**
 * Shop share links (ledger D-129, handoff shop-share-v1 SH-M1–M6): the business's own link, for the branch the app
 * is working on. `live: false` (no code) while the business isn't live: the Share your shop row is hidden then.
 */
export function getShareLink(): Promise<MerchantShareLinkResponse> {
  return authedFetch<MerchantShareLinkResponse>("/merchant/share-link");
}

/** SH-M4: the counter QR as SVG text (encodes the link with `?src=qr`). */
export function getCounterQrSvg(): Promise<string> {
  return authedFetch<string>("/merchant/share-link/qr.svg", { as: "text" });
}

/** `https://wa.me/?text=…`: WhatsApp's own picker chooses the chat, group or Status (README §2). No number. */
export function shareOnWhatsAppUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** `lyniago.com/s/…` for display: the link without its scheme. */
export function displayLink(link: string): string {
  return link.replace(/^https?:\/\//, "");
}
