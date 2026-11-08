import { randomInt } from "node:crypto";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  type MerchantShareLinkResponse,
  normalizeShopCode,
  SHOP_CODE_ALPHABET,
  SHOP_CODE_LENGTH,
  shopLink,
  type ShopShareCardResponse,
  type ShopShareResolveResponse,
  type ShopShareService,
} from "@lynia/shared";
import { Prisma } from "@prisma/client";
import { currentThumbKey } from "../adapters/storage/photo-thumbnail";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { CUSTOMER_VISIBLE_RESTAURANT, customerVisibleShop, shopServiceEnabled } from "./merchant-lookup.util";
import { PHOTO_READ_URL_TTL_SECONDS } from "./merchant.service";

/** The one answer for every code that doesn't open a shop (unknown, not live, paused, suspended): never say which (R6). */
const GONE = "Shop not found";

const LIVE_FIELDS = { id: true, name: true, businessType: true, shopKind: true } as const;
type LiveMerchant = Prisma.MerchantGetPayload<{ select: typeof LIVE_FIELDS }>;

/**
 * Shop share links (plan docs/plans/2026-11-07-shop-share-links.md §7 lane A, ledger D-129).
 *
 * A business's code is minted on first ask and kept for good. Liveness is the browse pages' own rule
 * (CUSTOMER_VISIBLE_RESTAURANT with RESTAURANTS_ENABLED, customerVisibleShop for shops and pharmacies), so a link
 * opens exactly what the customer could find by browsing, and a business that stops being visible answers the
 * same 404 as a code that never existed.
 */
@Injectable()
export class ShareService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** SH-M1/M2: the merchant's own link. No code is minted while the business isn't live (DR6: no row then). */
  async linkFor(merchantId: string): Promise<MerchantShareLinkResponse> {
    const merchant = await this.liveMerchant({ id: merchantId });
    if (!merchant) return { live: false, code: null, link: null };
    const code = await this.codeFor(merchantId);
    return { live: true, code, link: shopLink(merchant.name, code) };
  }

  /** `GET /share/:code` (signed in): the store a link opens. */
  async resolve(rawCode: string): Promise<ShopShareResolveResponse> {
    const { code, merchant } = await this.liveByCode(rawCode);
    return { merchantId: merchant.id, service: serviceOf(merchant), link: shopLink(merchant.name, code) };
  }

  /** `GET /share/:code/card` (public, DR16): name, logo and cover of a live shop, and nothing else. */
  async card(rawCode: string): Promise<ShopShareCardResponse> {
    const { code, merchant } = await this.liveByCode(rawCode);
    const photos = await this.prisma.merchant.findUnique({
      where: { id: merchant.id },
      select: { logoUrl: true, logoThumbKey: true, coverPhotoUrl: true, coverThumbKey: true },
    });
    const [logoThumbUrl, coverThumbUrl] = await Promise.all([
      this.signThumb(photos?.logoUrl, photos?.logoThumbKey),
      this.signThumb(photos?.coverPhotoUrl, photos?.coverThumbKey),
    ]);
    return {
      name: merchant.name,
      service: serviceOf(merchant),
      shopKind: merchant.businessType === "shop" ? (merchant.shopKind ?? "other") : null,
      logoThumbUrl,
      coverThumbUrl,
      link: shopLink(merchant.name, code),
    };
  }

  /** The business's code, minted on first ask (the referral-code loop: a P2002 is a collision or a concurrent mint). */
  async codeFor(merchantId: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const existing = await this.prisma.merchantShareCode.findUnique({ where: { merchantId }, select: { code: true } });
      if (existing) return existing.code;
      try {
        const row = await this.prisma.merchantShareCode.create({ data: { merchantId, code: randomShopCode() }, select: { code: true } });
        return row.code;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }
    throw new ConflictException("Couldn't create a share link. Try again.");
  }

  private async liveByCode(rawCode: string): Promise<{ code: string; merchant: LiveMerchant }> {
    const code = normalizeShopCode(rawCode);
    if (!code) throw new NotFoundException(GONE);
    const row = await this.prisma.merchantShareCode.findUnique({ where: { code }, select: { merchantId: true } });
    const merchant = row ? await this.liveMerchant({ id: row.merchantId }) : null;
    if (!merchant) throw new NotFoundException(GONE);
    return { code, merchant };
  }

  /** A business a customer could open right now, by the browse pages' rules; null otherwise. */
  private liveMerchant(where: { id: string }): Promise<LiveMerchant | null> {
    const visible: Prisma.MerchantWhereInput[] = [];
    if (this.env.RESTAURANTS_ENABLED === "true") visible.push(CUSTOMER_VISIBLE_RESTAURANT);
    if (shopServiceEnabled(this.env)) visible.push(customerVisibleShop(this.env));
    if (visible.length === 0) return Promise.resolve(null);
    return this.prisma.merchant.findFirst({ where: { ...where, OR: visible }, select: LIVE_FIELDS });
  }

  /** The signed thumbnail of a photo, or null (no photo, no current thumb, or a signing hiccup: the card falls back). */
  private async signThumb(photoKey: string | null | undefined, thumbKey: string | null | undefined): Promise<string | null> {
    const key = currentThumbKey(photoKey, thumbKey);
    if (!key) return null;
    return this.storage.createReadUrl(key, PHOTO_READ_URL_TTL_SECONDS).catch(() => null);
  }
}

export function serviceOf(merchant: Pick<LiveMerchant, "businessType" | "shopKind">): ShopShareService {
  if (merchant.businessType !== "shop") return "restaurants";
  return merchant.shopKind === "pharmacy" ? "pharmacy" : "shops";
}

function randomShopCode(): string {
  let code = "";
  for (let i = 0; i < SHOP_CODE_LENGTH; i++) code += SHOP_CODE_ALPHABET[randomInt(SHOP_CODE_ALPHABET.length)];
  return code;
}
