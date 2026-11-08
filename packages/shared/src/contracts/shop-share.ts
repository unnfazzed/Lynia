import { z } from "zod";
import { MerchantShopKind } from "./merchant";

// Shop share links (plan docs/plans/2026-11-07-shop-share-links.md, ledger D-129). The link format itself lives in
// ../shop-link.ts; these are the API's three answers about a link.

/** Which customer section a shared shop opens in: the restaurant, shop or pharmacy store page. */
export const ShopShareService = z.enum(["restaurants", "shops", "pharmacy"]);
export type ShopShareService = z.infer<typeof ShopShareService>;

/** `GET /share/:code` (signed in): where the link goes. Unknown, not live and paused codes are all one 404. */
export const ShopShareResolveResponse = z
  .object({
    merchantId: z.string().uuid(),
    service: ShopShareService,
    /** The canonical link for the shop's current name (redirect a stale or made-up name to it). */
    link: z.string(),
  })
  .strict();
export type ShopShareResolveResponse = z.infer<typeof ShopShareResolveResponse>;

/**
 * `GET /share/:code/card` (public, DR16): the only things anyone sees about a shop before signing in. Its name,
 * its logo and cover (signed thumbnails, absent when there's no photo), and what the no-photo fallback needs:
 * the service tint and the kind (null for restaurants). Nothing else (no menu, prices, hours, location).
 */
export const ShopShareCardResponse = z
  .object({
    name: z.string(),
    service: ShopShareService,
    shopKind: MerchantShopKind.nullable(),
    logoThumbUrl: z.string().nullable(),
    coverThumbUrl: z.string().nullable(),
    link: z.string(),
  })
  .strict();
export type ShopShareCardResponse = z.infer<typeof ShopShareCardResponse>;

/** `GET /merchant/share-link` (merchant app, SH-M1/M2): this business's link, and whether to show the row (DR6). */
export const MerchantShareLinkResponse = z
  .object({
    /** Live now (approved, switched on, not suspended, its section on). The Share row exists only while true. */
    live: z.boolean(),
    /** Null while not live: a code is minted only for a business whose link would open. */
    code: z.string().nullable(),
    link: z.string().nullable(),
  })
  .strict();
export type MerchantShareLinkResponse = z.infer<typeof MerchantShareLinkResponse>;
