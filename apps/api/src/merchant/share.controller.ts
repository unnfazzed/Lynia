import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Throttle } from "../common/throttle.guard";
import { CurrentMerchantAccess, MerchantGuard } from "./merchant.guard";
import type { MerchantAccess } from "./merchant-access";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";
import { ShareService } from "./share.service";

/**
 * Shop share links (plan docs/plans/2026-11-07-shop-share-links.md, ledger D-129). Two customer routes:
 *
 * - `GET /share/:code` (signed in, O1: nobody sees a shop through a link before signing in) → where it opens.
 * - `GET /share/:code/card` (public, DR16) → a live shop's name, logo and cover only, for the website's landing
 *   page, the WhatsApp preview and the "Taking you to" chip on the sign-in screens.
 *
 * Unknown, not-live and paused codes answer the same 404 (R6). No RestaurantsEnabledGuard: a shared pharmacy must
 * open while restaurants are switched off; ShareService applies each section's own switch. Both throttled per IP.
 */
@Controller("share")
export class ShareController {
  constructor(private readonly share: ShareService) {}

  @Get(":code")
  @UseGuards(JwtAuthGuard)
  @Throttle({ limit: 60, windowSec: 300, keyPrefix: "share-resolve" })
  resolve(@Param("code") code: string) {
    return this.share.resolve(code);
  }

  @Get(":code/card")
  @Throttle({ limit: 120, windowSec: 300, keyPrefix: "share-card" })
  card(@Param("code") code: string) {
    return this.share.card(code);
  }
}

/** SH-M1/M2: the merchant app's own link for the business it's working on (each branch has its own). Staff and owners.
 *  Behind the merchant kill switch like every `merchant/*` controller (merchant-routes-dead.e2e.spec.ts). */
@Controller("merchant/share-link")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard, MerchantGuard)
export class MerchantShareController {
  constructor(private readonly share: ShareService) {}

  @Get()
  mine(@CurrentMerchantAccess() access: MerchantAccess) {
    return this.share.linkFor(access.merchantId);
  }
}
