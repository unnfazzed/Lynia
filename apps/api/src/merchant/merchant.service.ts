import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  BecomeMerchantRequest,
  DishOutOfStockFor,
  MerchantCategoryRequest,
  MerchantCategoryResponse,
  MerchantDishRequest,
  MerchantDishResponse,
  MerchantEndOfDaySummaryResponse,
  MerchantHours,
  MerchantMemberRole,
  MerchantPaymentMethod,
  MerchantProfileResponse,
  MerchantStatementLineItem,
  MerchantWeeklyStatementResponse,
  RestaurantListItem,
  RestaurantListResponse,
  RestaurantMenuDish,
  RestaurantMenuResponse,
  RestaurantSearchDish,
  RestaurantSearchResponse,
  SetMerchantBusyModeRequest,
  UpdateMerchantOrderSettingsRequest,
  SetMerchantOpenRequest,
  UpdateMerchantCashRuleRequest,
  UpdateMerchantCategoryRequest,
  UpdateMerchantDishRequest,
  UpdateMerchantHoursRequest,
  UpdateMerchantLocationRequest,
  UpdateMerchantProfileRequest,
  Waypoint,
} from "@lynia/shared";
import {
  addMoney,
  effectiveMerchantHours,
  haversineKm,
  merchantWaypoint,
  RESTAURANTS_COMMISSION,
  RESTAURANTS_DEBT,
  roundToCents,
  SERVICE_CORRIDOR,
  startOfNextDay,
} from "@lynia/shared";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { ownNamespace, type UploadKind } from "../adapters/storage/upload-kinds";
import { UploadVerifier } from "../adapters/storage/upload-verifier";
import { MicroCache } from "../common/micro-cache";
import { MicroCacheL2Provider } from "../common/micro-cache-l2.provider";
import { maskPhone } from "../common/phone-mask";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { lockMembershipsTx, resolveMerchantAccess } from "./merchant-access";
import { findBookingAccountId } from "./booking-account";
import { CUSTOMER_VISIBLE_RESTAURANT, isDishOutOfStock as isOutOfStock, resolveOwnMerchantId } from "./merchant-lookup.util";

type MerchantWithOwner = Prisma.MerchantGetPayload<{ include: { ownerProfile: { select: { phone: true } } } }>;
/** The caller's own business, plus the caller's role on it (L1: `MerchantProfileResponse.myRole`) and
 *  their name on its team (L4: `myName`). */
type OwnMerchant = MerchantWithOwner & { myRole: MerchantMemberRole; myName: string | null };

type DishRow = Prisma.MerchantDishGetPayload<Record<string, never>>;
type CategoryRow = Prisma.MerchantCategoryGetPayload<{ include: { _count: { select: { dishes: true } } } }>;
type PlainCategoryRow = Prisma.MerchantCategoryGetPayload<Record<string, never>>;

/** Splits sign-up's single "Your name" into the profile's first/last name (first word, then the rest). */
export function splitPersonName(full: string): { firstName: string; lastName: string } {
  const [first = "", ...rest] = full.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
}

// E4/D-32: `coverPhotoUrl`/`logoUrl`/dish `photoUrl` persist the raw GCS object KEY (the bucket has
// no public objects — infra/terraform/storage.tf enforces `public_access_prevention = "enforced"`,
// every read goes through a V4 signed URL), the same shape rider KYC photos already use
// (admin-kyc-review.service.ts).
//
// 24 HOURS, deliberately (RCA 2026-08-17 §5.1): these are PUBLIC menu/marketing photos, not KYC
// documents — the old 1 h validity was inherited from the leaked-URL reasoning of the KYC lane, and
// it is what made the phone's image cache miss across sessions (a lunchtime and an evening open
// never shared a URL). A leaked menu-photo URL replayable for a day is a non-risk; the bound still
// exists so a cached tablet response can't be replayed indefinitely.
const PHOTO_READ_URL_TTL_SECONDS = 24 * 60 * 60;

// Serve each minted URL from cache for 14 h of its 24 h validity: with the cache's ±10% TTL jitter
// the worst-case entry lives 15.4 h, so any URL a client is handed still has ≥8.6 h of signed life
// (the jitter-aware bound the plan review demanded — a naive 16 h cache would have left only 6.4 h).
// Byte-stable URLs are the whole point: the device image cache and the JSON ETag/304 machinery both
// key on the exact string, and a fresh V4 signature per response defeated both (plus one IAM
// `signBlob` RPC per photo per response — up to ~40 per list page). L1-only and per-instance
// (documented limitation): 2-3 Cloud Run instances mint independently, so a phone can still see a
// few URL variants per photo per window — each variant caches for hours, which is what matters.
// Cross-instance byte-stability needs the shared Redis L2 (TODO — requires extracting
// OrdersService's private L2 provider into a shared seam).
const MERCHANT_PHOTO_URL_CACHE_TTL_MS = 14 * 60 * 60 * 1000;

// B-O10: `GET /restaurants` had no server-side cap — every other list endpoint (history 50, board
// 50, notifications 30) does. 20 keeps a single page's DB round-trip + payload small on a metered
// 2G/3G link while still filling a typical phone screen (mirrors LEDGER_PAGE_SIZE's "one page ≈ one
// screenful" sizing, `wallet.service.ts`).
const RESTAURANTS_PAGE_SIZE = 20;
// #673 search: cap each of the PLACES / DISHES result sets, and ignore blank/1-char queries so a
// stray keystroke never dumps the corridor (the search screen shows results only once typing).
const RESTAURANTS_SEARCH_LIMIT = 20;
/** Browse v2 (D-57) "Popular" rail: a kitchen's most-ordered dishes over this window. */
const POPULAR_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** A dish needs this many delivered orders in the window to count as popular — one lucky order isn't. */
const POPULAR_MIN_ORDERS = 3;
/** The rail holds at most this many dishes, and is dropped below two (a rail of one is not a rail). */
const POPULAR_MAX = 6;
const POPULAR_MIN_DISHES = 2;
const RESTAURANTS_SEARCH_MIN_CHARS = 2;

/** N-14: "for the rest of today" — end of the server's local calendar day. A past timestamp reads as
 *  back-in-stock, so no reset job is needed; this is the only place that boundary is computed. */
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** `RM.oos_sheet`'s "Until I turn it back on" (merchant web upgrade L5): a date no kitchen reaches, so
 *  every existing read (`isDishOutOfStock`, the customer menu) keeps treating it as out of stock until
 *  "Back in stock" clears it. No new column, no reset job. */
export const OUT_OF_STOCK_UNTIL_BACK = new Date(Date.UTC(9999, 11, 31, 23, 59, 59));

function outOfStockUntil(forHowLong: DishOutOfStockFor = "rest_of_today"): Date {
  if (forHowLong === "until_back") return OUT_OF_STOCK_UNTIL_BACK;
  if (forHowLong === "one_hour") return new Date(Date.now() + 60 * 60 * 1000);
  return endOfToday();
}

/** D-48 C3: how one of today's orders ended, for Money's list. */
function moneyLineOutcome(o: { status: string; prepStartedAt: Date | null }): "delivered" | "not_delivered" | "rejected" | "cancelled" | "in_progress" {
  if (o.status === "delivered" || o.status === "completed") return "delivered";
  if (o.status === "undelivered") return "not_delivered";
  if (o.status === "cancelled") return o.prepStartedAt ? "cancelled" : "rejected";
  return "in_progress";
}

@Injectable()
export class MerchantService {
  // Read-through micro-cache for photo read-URLs (RCA 2026-08-17 §5.1) — same shape as
  // OrdersService.pickupPhotoUrlCache: L1, single-flight (a 20-merchant list page fires up to ~40
  // concurrent mints that coalesce per key), bounded FIFO, ±10% TTL jitter, hit rates observable
  // under the closed "merchant_photo_url" label. The onEvent closure resolves `this.metricsSvc` at
  // CALL time, so field-initializer order vs constructor params is never a hazard.
  private readonly photoUrlCache = new MicroCache<string>(500, {
    ttlJitterRatio: 0.1,
    onEvent: (o) => this.metricsSvc?.recordMicroCache("merchant_photo_url", o),
    // D6: the shared Redis L2 (common/micro-cache-l2.provider.ts) — the cross-instance half of
    // byte-stable URLs. Resolved at CALL time (thunk) and TS-optional like every dep below, so the
    // existing spec constructions and an L2-less deploy both run L1-only unchanged.
    l2: () => this.l2?.resolve() ?? null,
    l2KeyPrefix: "mc:mphoto:",
  });

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    // Both @Global-provided (ConfigModule / ObservabilityModule) so Nest always injects them in
    // production; TS-optional keeps the existing 2-arg spec constructions valid — with them absent
    // the cache runs flagless and metrics are a no-op (the OrdersService convention).
    @Inject(ENV) private readonly env?: Env,
    private readonly metricsSvc?: MetricsService,
    private readonly l2?: MicroCacheL2Provider,
    // C1/E8 attach-time upload check — @Global-provided like the two above; absent only in unit harnesses.
    private readonly uploads?: UploadVerifier,
  ) {}

  /**
   * C1/E8: gate a photo key before it is recorded on a merchant/dish row. The key must sit under the
   * caller's own upload namespace (`banner/<profileId>/` for cover + logo, `dish/<profileId>/` for dishes —
   * what POST /uploads/merchant-*-photo mints), mirroring the rider KYC/pickup guards; then the stored
   * object is verified (exists, within the D-32 cap, really a JPEG/PNG). The namespace check comes first
   * because a failed verification deletes the object. Re-saving the value the row already holds is a
   * no-op, so an unchanged photo is never re-checked.
   */
  private async verifyPhotoKey(key: string, current: string | null, profileId: string, kind: UploadKind): Promise<void> {
    if (key === current) return;
    if (!key.startsWith(ownNamespace(kind, profileId))) throw new BadRequestException("Invalid photo key");
    await this.uploads?.verify(key, kind);
  }

  /** The runtime kill-switch (MICRO_CACHE_DISABLED) plus the per-cache "TTL 0 disables it" rule —
   *  mirrors OrdersService.microCacheBypassed. */
  private microCacheBypassed(ttlMs: number): boolean {
    return this.env?.MICRO_CACHE_DISABLED === "true" || ttlMs <= 0;
  }

  /**
   * L1 self-serve sign-up (docs/plans/2026-09-29-merchant-web-upgrade-plan.md D5). Creates the business
   * and the caller's OWNER membership in one transaction, dormant (`pilotEnabled` stays an ops switch).
   *
   * It never writes `profiles.role` (RCA 2026-08-18 C-4): access is the membership row, which
   * MerchantGuard reads on the very next request, and a customer who opens a business keeps a working
   * customer app. `owner_profile_id` is still set — `ownerPhoneMasked` and the legacy resolver read it
   * (plan §11 OV-4).
   *
   * Standing (OV-5): the same people Send won't let book can't open a business either — a held account,
   * or a banned/suspended rider account.
   */
  async becomeMerchant(profileId: string, body: BecomeMerchantRequest): Promise<MerchantProfileResponse> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { firstName: true, lastName: true, onHold: true, rider: { select: { accountStatus: true } } },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    if (profile.onHold) {
      throw new ForbiddenException({ reason: "on_hold", message: "This account is on hold. Message LyniaGo on WhatsApp to sort it out." });
    }
    if (profile.rider && profile.rider.accountStatus !== "active") {
      throw new ForbiddenException({ reason: "account_restricted", message: "This number can't set up a business. Message LyniaGo on WhatsApp." });
    }
    if (haversineKm(body.location.point, { lat: SERVICE_CORRIDOR.centerLat, lng: SERVICE_CORRIDOR.centerLng }) > SERVICE_CORRIDOR.radiusKm) {
      throw new BadRequestException({ reason: "outside_service_area", message: "That pin is outside the area LyniaGo covers for now." });
    }
    if (await resolveMerchantAccess(this.prisma, profileId)) throw alreadyMember();

    const ownerName = body.ownerName.trim();
    const nameIsEmpty = profile.firstName.trim() === "" && profile.lastName.trim() === "";
    try {
      await this.prisma.$transaction(async (tx) => {
        // Re-checked under the person's lock: a double submit can't open two businesses (branches are
        // opened from inside the app, docs/plans/2026-09-30-multi-branch-owners.md).
        if ((await lockMembershipsTx(tx, profileId)).length > 0) throw alreadyMember();
        const merchant = await tx.merchant.create({
          data: {
            name: body.name,
            ownerProfileId: profileId,
            cashRule: body.cashRule ?? "collect_and_return",
            businessType: body.businessType,
            // D-48: the mobile sign-up asks only restaurant or shop, so a shop without a kind is `other`.
            shopKind: body.businessType === "shop" ? (body.shopKind ?? "other") : null,
            location: merchantWaypoint(body.location, body.name) as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        await tx.merchantMember.create({
          data: {
            merchantId: merchant.id,
            profileId,
            role: "owner",
            displayName: ownerName,
            termsAcceptedAt: new Date(),
            addedByProfileId: profileId,
          },
        });
        // "Your name" fills an empty LyniaGo profile (a never-seen number signs up with no name) and
        // never overwrites a name the person already chose in the app.
        if (nameIsEmpty) await tx.profile.update({ where: { id: profileId }, data: splitPersonName(ownerName) });
      });
    } catch (err) {
      // The profile lock above is the real guard against a concurrent double submit (the pre-check
      // races it); a unique index firing still means someone else got there first.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw alreadyMember();
      throw err;
    }
    return await this.getMyMerchant(profileId);
  }

  async getMyMerchant(profileId: string): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    return await this.toProfileResponse(merchant, merchant);
  }

  async updateProfile(profileId: string, body: UpdateMerchantProfileRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const data: Prisma.MerchantUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.coverPhotoUrl !== undefined) {
      await this.verifyPhotoKey(body.coverPhotoUrl, merchant.coverPhotoUrl, profileId, "banner");
      data.coverPhotoUrl = body.coverPhotoUrl;
    }
    if (body.logoUrl !== undefined) {
      await this.verifyPhotoKey(body.logoUrl, merchant.logoUrl, profileId, "banner");
      data.logoUrl = body.logoUrl;
    }
    if (body.cuisineTags !== undefined) data.cuisineTags = body.cuisineTags;
    if (body.priceLevel !== undefined) data.priceLevel = body.priceLevel;
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data,
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated, merchant);
  }

  async updateHours(profileId: string, body: UpdateMerchantHoursRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { hours: body.hours as Prisma.InputJsonValue },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated, merchant);
  }

  async updateCashRule(profileId: string, body: UpdateMerchantCashRuleRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { cashRule: body.cashRule },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated, merchant);
  }

  /** C2: the shop's own pickup point — required before placeOrder can price a trip (N-01 needs a
   *  distance). Stored in the same Waypoint shape as a parcel's pickup; the landmark is optional on the
   *  way in (D-48) and `merchantWaypoint` fills it from the address line or the business name. */
  async updateLocation(profileId: string, body: UpdateMerchantLocationRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { location: merchantWaypoint(body.location, merchant.name) as Prisma.InputJsonValue },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated, merchant);
  }

  /** For FoodOrderService.placeOrder — the merchant's pickup point, or null if not set yet. */
  async findLocation(merchantId: string): Promise<Waypoint | null> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { location: true } });
    return (merchant?.location as Waypoint | null) ?? null;
  }

  /** D-48 (merchant mobile B1/B5): the Orders header's open/closed switch. Closing holds until the next
   *  day starts (the switch starts on inside hours tomorrow) or until the merchant opens again. */
  async setOpen(profileId: string, body: SetMerchantOpenRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { closedUntil: body.open ? null : startOfNextDay(new Date()) },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated, merchant);
  }

  /** Auto-accept: how the restaurant takes orders (owner only; ops can set the same from admin). */
  async updateOrderSettings(profileId: string, body: UpdateMerchantOrderSettingsRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        ...(body.autoAccept !== undefined ? { autoAccept: body.autoAccept } : {}),
        ...(body.showPhoneToCustomers !== undefined ? { showPhoneToCustomers: body.showPhoneToCustomers } : {}),
      },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated, merchant);
  }

  async setBusyMode(profileId: string, body: SetMerchantBusyModeRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { busyMode: body.active },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated, merchant);
  }

  // --- Categories (D-29) ---

  async listCategories(profileId: string): Promise<MerchantCategoryResponse[]> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    const categories = await this.prisma.merchantCategory.findMany({
      where: { merchantId },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { dishes: true } } },
    });
    return categories.map((c) => this.toCategoryResponse(c));
  }

  async createCategory(profileId: string, body: MerchantCategoryRequest): Promise<MerchantCategoryResponse> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    if ((body.availableFrom === undefined) !== (body.availableTo === undefined)) {
      throw new BadRequestException("availableFrom and availableTo must be set together");
    }
    const created = await this.prisma.merchantCategory.create({
      data: {
        merchantId,
        name: body.name,
        availableFrom: body.availableFrom ?? null,
        availableTo: body.availableTo ?? null,
      },
      include: { _count: { select: { dishes: true } } },
    });
    return this.toCategoryResponse(created);
  }

  async updateCategory(
    profileId: string,
    categoryId: string,
    body: UpdateMerchantCategoryRequest,
  ): Promise<MerchantCategoryResponse> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    await this.findOwnCategoryOrThrow(merchantId, categoryId);

    const data: Prisma.MerchantCategoryUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.availableFrom !== undefined) data.availableFrom = body.availableFrom;
    if (body.availableTo !== undefined) data.availableTo = body.availableTo;
    if (body.hidden !== undefined) data.hidden = body.hidden;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

    const updated = await this.prisma.merchantCategory.update({
      where: { id: categoryId },
      data,
      include: { _count: { select: { dishes: true } } },
    });
    return this.toCategoryResponse(updated);
  }

  /** D-29: a category is deletable only once empty — enforced here, not the DB (dishes cascade on
   *  category delete at the schema level for referential safety, but a merchant must clear the menu
   *  first rather than silently losing dishes to a cascade). */
  async deleteCategory(profileId: string, categoryId: string): Promise<{ ok: true }> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    const existing = await this.prisma.merchantCategory.findFirst({
      where: { id: categoryId, merchantId },
      include: { _count: { select: { dishes: true } } },
    });
    if (!existing) throw new NotFoundException("Category not found");
    if (existing._count.dishes > 0) {
      throw new ConflictException("Remove all dishes from this category before deleting it");
    }
    await this.prisma.merchantCategory.delete({ where: { id: categoryId } });
    return { ok: true };
  }

  // --- Dishes (D-31 draft state, N-14 OOS) ---

  /** E4: the menu manager's own read — `listCategories` only ever returned counts, never the dishes
   *  themselves (nothing consumed it before the tablet's own menu-management UI existed). Flat list,
   *  within-category sort order only — the client already holds categories ordered by their own
   *  `sortOrder` from `listCategories` and groups this list by `categoryId` against that, rather than
   *  the server nesting a second near-identical shape. */
  async listDishes(profileId: string): Promise<MerchantDishResponse[]> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    const dishes = await this.prisma.merchantDish.findMany({
      where: { merchantId },
      orderBy: { sortOrder: "asc" },
    });
    return Promise.all(dishes.map((d) => this.toDishResponse(d)));
  }

  async createDish(profileId: string, body: MerchantDishRequest): Promise<MerchantDishResponse> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    const category = await this.findOwnCategoryOrThrow(merchantId, body.categoryId);
    if (body.photoUrl) await this.verifyPhotoKey(body.photoUrl, null, profileId, "dish");
    const created = await this.prisma.merchantDish.create({
      data: {
        categoryId: category.id,
        merchantId,
        name: body.name,
        description: body.description ?? null,
        priceUsd: body.priceUsd,
        photoUrl: body.photoUrl ?? null,
        // D-31: no photo at save time => draft, visible to the kitchen only. Never client-supplied.
        isDraft: !body.photoUrl,
      },
    });
    return await this.toDishResponse(created);
  }

  async updateDish(profileId: string, dishId: string, body: UpdateMerchantDishRequest): Promise<MerchantDishResponse> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    const dish = await this.findOwnDishOrThrow(merchantId, dishId);

    const data: Prisma.MerchantDishUpdateInput = {};
    if (body.categoryId !== undefined) {
      await this.findOwnCategoryOrThrow(merchantId, body.categoryId);
      data.category = { connect: { id: body.categoryId } };
    }
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.priceUsd !== undefined) data.priceUsd = body.priceUsd;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    // D-31: a photo landing clears the draft flag; omitting photoUrl on an edit never re-drafts a
    // dish that already has one.
    if (body.photoUrl !== undefined) {
      await this.verifyPhotoKey(body.photoUrl, dish.photoUrl, profileId, "dish");
      data.photoUrl = body.photoUrl;
      data.isDraft = false;
    }

    const updated = await this.prisma.merchantDish.update({ where: { id: dishId }, data });
    return await this.toDishResponse(updated);
  }

  async deleteDish(profileId: string, dishId: string): Promise<{ ok: true }> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    await this.findOwnDishOrThrow(merchantId, dishId);
    await this.prisma.merchantDish.delete({ where: { id: dishId } });
    return { ok: true };
  }

  async setDishOutOfStock(profileId: string, dishId: string, forHowLong?: DishOutOfStockFor): Promise<MerchantDishResponse> {
    return this.writeDishOutOfStock(profileId, dishId, outOfStockUntil(forHowLong));
  }

  async clearDishOutOfStock(profileId: string, dishId: string): Promise<MerchantDishResponse> {
    return this.writeDishOutOfStock(profileId, dishId, null);
  }

  private async writeDishOutOfStock(profileId: string, dishId: string, until: Date | null): Promise<MerchantDishResponse> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    await this.findOwnDishOrThrow(merchantId, dishId);
    const updated = await this.prisma.merchantDish.update({ where: { id: dishId }, data: { outOfStockUntil: until } });
    return await this.toDishResponse(updated);
  }

  // --- Customer read API (RESTAURANTS_ENABLED + per-merchant pilotEnabled allowlist) ---

  /** B-O10: cursor-paginated (was a single unbounded `findMany`) — `cursor` is the last-seen
   *  merchant id from a previous page. `id` is unique so it identifies a row unambiguously even
   *  though the primary sort (`name`) isn't; the secondary `id` sort just makes ties (two merchants
   *  with the same name) deterministic across pages, matching `WalletService.getLedger`'s
   *  take-one-extra-to-detect-`hasMore` shape. */
  async listRestaurants(cursor?: string): Promise<RestaurantListResponse> {
    const merchants = await this.prisma.merchant.findMany({
      where: CUSTOMER_VISIBLE_RESTAURANT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: RESTAURANTS_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = merchants.length > RESTAURANTS_PAGE_SIZE;
    const page = hasMore ? merchants.slice(0, RESTAURANTS_PAGE_SIZE) : merchants;
    return {
      restaurants: await Promise.all(page.map((m) => this.toListItem(m))),
      nextCursor: hasMore ? page[page.length - 1]!.id : undefined,
    };
  }

  /** #673: cross-restaurant search — PLACES (restaurant name) + DISHES (menu items across the pilot
   *  corridor). The client search screen could only filter the already-loaded restaurant list before;
   *  this is the server dish index it flagged as missing. Too-short/blank queries return nothing (the
   *  screen shows results only once the customer types), never the whole catalog. */
  async searchRestaurants(rawQuery?: string): Promise<RestaurantSearchResponse> {
    const q = (rawQuery ?? "").trim();
    if (q.length < RESTAURANTS_SEARCH_MIN_CHARS) return { restaurants: [], dishes: [] };

    // PLACES — pilot restaurants whose name matches. (Cuisine-tag substring stays a client nicety;
    // the server index is restaurant name + the dish index below.)
    const restaurantRows = await this.prisma.merchant.findMany({
      where: { ...CUSTOMER_VISIBLE_RESTAURANT, name: { contains: q, mode: "insensitive" } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: RESTAURANTS_SEARCH_LIMIT,
    });
    const restaurants = await Promise.all(restaurantRows.map((m) => this.toListItem(m)));

    // DISHES — non-draft dishes across pilot restaurants matching name or description. Bounded to the
    // pilot set UP FRONT (merchantId in pilotIds) so a non-pilot merchant's dish can never leak into a
    // customer result, and joined to the pilot name map for the "· Restaurant ·" line.
    const pilots = await this.prisma.merchant.findMany({ where: CUSTOMER_VISIBLE_RESTAURANT, select: { id: true, name: true } });
    const pilotName = new Map(pilots.map((p) => [p.id, p.name] as const));
    const dishRows = pilots.length
      ? await this.prisma.merchantDish.findMany({
          where: {
            merchantId: { in: pilots.map((p) => p.id) },
            isDraft: false,
            OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }],
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: RESTAURANTS_SEARCH_LIMIT,
        })
      : [];
    const dishes: RestaurantSearchDish[] = await Promise.all(
      dishRows.map(async (d) => ({
        dishId: d.id,
        name: d.name,
        priceUsd: Number(d.priceUsd),
        photoUrl: await this.signPhoto(d.photoUrl),
        merchantId: d.merchantId,
        merchantName: pilotName.get(d.merchantId) ?? "",
      })),
    );
    return { restaurants, dishes };
  }

  async getRestaurantMenu(merchantId: string): Promise<RestaurantMenuResponse> {
    const merchant = await this.prisma.merchant.findFirst({ where: { id: merchantId, ...CUSTOMER_VISIBLE_RESTAURANT } });
    if (!merchant) throw new NotFoundException("Restaurant not found");
    const categories = await this.prisma.merchantCategory.findMany({
      where: { merchantId: merchant.id, hidden: false },
      orderBy: { sortOrder: "asc" },
      // D-31: draft (photoless) dishes are excluded entirely from the customer read API.
      include: { dishes: { where: { isDraft: false }, orderBy: { sortOrder: "asc" } } },
    });
    const dishIds = categories.flatMap((c) => c.dishes.map((d) => d.id));
    return {
      restaurant: await this.toListItem(merchant),
      categories: await Promise.all(
        categories.map(async (c) => ({
          id: c.id,
          name: c.name,
          dishes: await Promise.all(c.dishes.map((d) => this.toCustomerDish(d))),
          availableFrom: c.availableFrom,
          availableTo: c.availableTo,
        })),
      ),
      popularDishIds: await this.popularDishIds(merchant.id, dishIds),
    };
  }

  /** Browse v2 (D-57): the storefront's "Popular" rail — the dishes on today's menu that delivered
   *  orders over the last 30 days picked most often. Ranked by how many orders included the dish (not
   *  by quantity, so one office's 20-portion order doesn't outrank 20 separate customers). Empty when
   *  fewer than two dishes clear the bar: the client then draws no rail rather than a thin one. */
  private async popularDishIds(merchantId: string, menuDishIds: string[]): Promise<string[]> {
    if (menuDishIds.length < POPULAR_MIN_DISHES) return [];
    const rows = await this.prisma.merchantOrderItem.groupBy({
      by: ["dishId"],
      where: {
        dishId: { in: menuDishIds },
        order: { merchantId, status: { in: ["delivered", "completed"] }, createdAt: { gte: new Date(Date.now() - POPULAR_WINDOW_MS) } },
      },
      _count: { orderId: true },
    });
    const ranked = rows
      .filter((r): r is typeof r & { dishId: string } => r.dishId != null && r._count.orderId >= POPULAR_MIN_ORDERS)
      // Ties keep menu order, so the rail doesn't reshuffle between two equally popular dishes.
      .sort((a, b) => b._count.orderId - a._count.orderId || menuDishIds.indexOf(a.dishId) - menuDishIds.indexOf(b.dishId))
      .slice(0, POPULAR_MAX)
      .map((r) => r.dishId);
    return ranked.length >= POPULAR_MIN_DISHES ? ranked : [];
  }

  // ── E3: money surfaces — weekly statement + end-of-day summary (N-13) ─────────────────────────────

  /** N-13: last-7-days rolling window (server-local clock, same boundary style as {@link endOfToday})
   *  — a calendar-week cut wasn't specified anywhere in the design, so a rolling window is the
   *  defensible default; flagged for product to confirm, not silently assumed to be "correct". Only
   *  `delivered` orders count as sales (an order the merchant never handed over earned nothing);
   *  `cookedFoodLossTotal` sums NO_RIDER cancellations in the same window as the D-34 "logged as a
   *  loss LyniaGo covers" line — visibility only, no ledger transfer exists yet (open item). */
  async getWeeklyStatement(profileId: string): Promise<MerchantWeeklyStatementResponse> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const delivered = await this.prisma.order.findMany({
      where: { merchantId, orderType: "merchant", status: "delivered", deliveredAt: { gte: rangeStart, lte: rangeEnd } },
      select: { id: true, deliveredAt: true, merchantPaymentMethod: true, merchantGoodsTotal: true },
      orderBy: { deliveredAt: "desc" },
      take: 200,
    });
    const noRiderLoss = await this.prisma.order.aggregate({
      where: {
        merchantId,
        orderType: "merchant",
        status: "cancelled",
        rejectionReason: "no_rider",
        cancelledAt: { gte: rangeStart, lte: rangeEnd },
      },
      _sum: { merchantGoodsTotal: true },
    });

    const ratePct = RESTAURANTS_COMMISSION.currentRatePct;
    const lineItems: MerchantStatementLineItem[] = delivered.map((o) => {
      const amount = roundToCents(Number(o.merchantGoodsTotal ?? 0));
      return {
        orderId: o.id,
        deliveredAt: (o.deliveredAt ?? new Date()).toISOString(),
        paymentMethod: (o.merchantPaymentMethod ?? "cash") as MerchantPaymentMethod,
        amount,
        commission: roundToCents(amount * (ratePct / 100)),
      };
    });
    const foodSalesTotal = roundToCents(lineItems.reduce((sum, li) => sum + li.amount, 0));

    return {
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      ordersDelivered: lineItems.length,
      foodSalesTotal,
      commissionRatePct: ratePct,
      commissionCharged: roundToCents(foodSalesTotal * (ratePct / 100)),
      illustrativeRatePct: RESTAURANTS_COMMISSION.illustrativeRatePct,
      illustrativeCommission: roundToCents(foodSalesTotal * (RESTAURANTS_COMMISSION.illustrativeRatePct / 100)),
      cookedFoodLossTotal: roundToCents(Number(noRiderLoss._sum.merchantGoodsTotal ?? 0)),
      lineItems,
    };
  }

  /** M4·6 "what the owner actually asks at closing time" — read-only, today's calendar day (server
   *  local, same boundary as {@link endOfToday}). `cashTaken` only counts collect-and-return debts the
   *  merchant actually confirmed today (`confirmReturnedCash`) — pay-me-upfront cash has no ledger
   *  (C4's own scope cut), so it's honestly omitted rather than estimated (flagged, not guessed). */
  async getTodaySummary(profileId: string): Promise<MerchantEndOfDaySummaryResponse> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = endOfToday();

    const overdueBefore = new Date(Date.now() - RESTAURANTS_DEBT.cashReturnWindowMs);
    const [delivered, rejected, walletTaken, cashTaken, prepped, placed, overdueRows, todays] = await Promise.all([
      this.prisma.order.count({
        where: { merchantId, orderType: "merchant", status: "delivered", deliveredAt: { gte: start, lte: end } },
      }),
      this.prisma.order.count({
        where: { merchantId, orderType: "merchant", status: "cancelled", cancelledAt: { gte: start, lte: end } },
      }),
      this.prisma.order.aggregate({
        where: {
          merchantId,
          orderType: "merchant",
          merchantPaymentMethod: "wallet",
          merchantPaymentConfirmedAt: { gte: start, lte: end },
        },
        _sum: { merchantGoodsTotal: true },
      }),
      this.prisma.order.aggregate({
        where: { merchantId, orderType: "merchant", debtStatus: "settled_cash", debtSettledAt: { gte: start, lte: end } },
        _sum: { debtAmount: true },
      }),
      this.prisma.order.findMany({
        where: { merchantId, orderType: "merchant", readyAt: { gte: start, lte: end }, prepStartedAt: { not: null } },
        select: { readyAt: true, prepStartedAt: true },
        take: 500,
      }),
      // D-48: today's orders that went through — accepted by the kitchen and not cancelled.
      this.prisma.order.aggregate({
        where: { merchantId, orderType: "merchant", createdAt: { gte: start, lte: end }, prepStartedAt: { not: null }, status: { not: "cancelled" } },
        _count: { _all: true },
        _sum: { merchantGoodsTotal: true },
      }),
      // D-48: cash a rider still owes back past its due time (delivered + the return window), neither
      // counted nor closed by the merchant. Any day's, not just today's: overdue is overdue.
      this.prisma.order.findMany({
        where: { merchantId, orderType: "merchant", debtStatus: "open", merchantClosedAt: null, deliveredAt: { lt: overdueBefore } },
        select: { id: true, debtAmount: true, deliveredAt: true, rider: { select: { profile: { select: { firstName: true } } } } },
        orderBy: { deliveredAt: "asc" },
        take: 50,
      }),
      // D-48 C3: today's orders for Money's list.
      this.prisma.order.findMany({
        where: { merchantId, orderType: "merchant", createdAt: { gte: start, lte: end } },
        select: { id: true, status: true, prepStartedAt: true, createdAt: true, deliveredAt: true, cancelledAt: true, merchantGoodsTotal: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    // D-48 PR 4b: a shop booking's cash on delivery, overdue the same way (its orders are the booking
    // account's, not the merchant's).
    const bookingAccountId = await findBookingAccountId(this.prisma, merchantId);
    const bookingOverdue = bookingAccountId
      ? await this.prisma.order.findMany({
          where: { customerId: bookingAccountId, orderType: "parcel", debtStatus: "open", merchantClosedAt: null, deliveredAt: { lt: overdueBefore } },
          select: { id: true, debtAmount: true, deliveredAt: true, rider: { select: { profile: { select: { firstName: true } } } } },
          orderBy: { deliveredAt: "asc" },
          take: 50,
        })
      : [];

    const prepMinutes = prepped
      .filter((o): o is { readyAt: Date; prepStartedAt: Date } => o.readyAt != null && o.prepStartedAt != null)
      .map((o) => (o.readyAt.getTime() - o.prepStartedAt.getTime()) / 60_000);
    const averagePrepMinutes = prepMinutes.length > 0 ? roundToCents(prepMinutes.reduce((a, b) => a + b, 0) / prepMinutes.length) : null;

    return {
      date: start.toISOString(),
      delivered,
      rejected,
      cashTaken: roundToCents(Number(cashTaken._sum.debtAmount ?? 0)),
      walletTaken: roundToCents(Number(walletTaken._sum.merchantGoodsTotal ?? 0)),
      averagePrepMinutes,
      orders: placed._count._all,
      sales: roundToCents(Number(placed._sum.merchantGoodsTotal ?? 0)),
      cashOverdue: addMoney(0, ...[...overdueRows, ...bookingOverdue].map((o) => Number(o.debtAmount ?? 0))),
      overdue: [
        ...overdueRows.map((o) => ({ o, kind: "order" as const })),
        ...bookingOverdue.map((o) => ({ o, kind: "booking" as const })),
      ].map(({ o, kind }) => ({
        orderId: o.id,
        amount: Number(o.debtAmount ?? 0),
        riderName: o.rider?.profile.firstName || null,
        dueAt: new Date(o.deliveredAt!.getTime() + RESTAURANTS_DEBT.cashReturnWindowMs).toISOString(),
        kind,
      })),
      lines: (todays ?? []).map((o) => {
        const outcome = moneyLineOutcome(o);
        const earns = outcome === "delivered" || outcome === "in_progress";
        return {
          orderId: o.id,
          at: (o.deliveredAt ?? o.cancelledAt ?? o.createdAt).toISOString(),
          outcome,
          amount: earns ? roundToCents(Number(o.merchantGoodsTotal ?? 0)) : 0,
        };
      }),
    };
  }

  /** The business the caller works at (owner or staff), via the membership resolver (plan D2). */
  private async findOwnMerchantOrThrow(profileId: string): Promise<OwnMerchant> {
    const access = await resolveMerchantAccess(this.prisma, profileId);
    if (!access) throw new NotFoundException("Merchant not found");
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: access.merchantId },
      include: { ownerProfile: { select: { phone: true } }, members: { where: { profileId }, select: { displayName: true } } },
    });
    if (!merchant) throw new NotFoundException("Merchant not found");
    const { members, ...rest } = merchant;
    return { ...rest, myRole: access.role, myName: members?.[0]?.displayName ?? null };
  }

  private async findOwnMerchantIdOrThrow(profileId: string): Promise<string> {
    return resolveOwnMerchantId(this.prisma, profileId);
  }

  private async findOwnCategoryOrThrow(merchantId: string, categoryId: string): Promise<PlainCategoryRow> {
    const category = await this.prisma.merchantCategory.findFirst({ where: { id: categoryId, merchantId } });
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }

  private async findOwnDishOrThrow(merchantId: string, dishId: string): Promise<DishRow> {
    const dish = await this.prisma.merchantDish.findFirst({ where: { id: dishId, merchantId } });
    if (!dish) throw new NotFoundException("Dish not found");
    return dish;
  }

  /** Best-effort read-URL mint, micro-cached by object key so the URL is byte-stable across
   *  responses for MERCHANT_PHOTO_URL_CACHE_TTL_MS (see the constant's comment for why that is the
   *  whole fix). The `.catch(() => null)` sits OUTSIDE the cache ON PURPOSE: inside the loader it
   *  would make `null` a *resolved value* and one signing hiccup would blank a photo everywhere for
   *  14 h — outside, a rejected mint is never cached (the MicroCache contract) and degrades to a
   *  one-response miss, exactly the old behavior. `null`/missing key never calls storage at all;
   *  MICRO_CACHE_DISABLED / a TTL-0 override route straight to the mint. */
  private async signPhoto(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;
    const ttlMs = this.env?.MICRO_CACHE_TTL_MS_MERCHANT_PHOTO_URL ?? MERCHANT_PHOTO_URL_CACHE_TTL_MS;
    const mint = (): Promise<string> => this.storage.createReadUrl(key, PHOTO_READ_URL_TTL_SECONDS);
    return (this.microCacheBypassed(ttlMs) ? mint() : this.photoUrlCache.getOrLoad(key, ttlMs, mint)).catch(() => null);
  }

  private async toProfileResponse(merchant: MerchantWithOwner, me: Pick<OwnMerchant, "myRole" | "myName">): Promise<MerchantProfileResponse> {
    const [coverPhotoUrl, logoUrl] = await Promise.all([this.signPhoto(merchant.coverPhotoUrl), this.signPhoto(merchant.logoUrl)]);
    return {
      id: merchant.id,
      name: merchant.name,
      ownerPhoneMasked: maskPhone(merchant.ownerProfile?.phone),
      description: merchant.description,
      coverPhotoUrl,
      logoUrl,
      cuisineTags: merchant.cuisineTags,
      priceLevel: merchant.priceLevel,
      hours: (merchant.hours as MerchantHours | null) ?? null,
      cashRule: merchant.cashRule,
      busy: merchant.busyMode,
      pilotEnabled: merchant.pilotEnabled,
      businessType: merchant.businessType,
      shopKind: merchant.shopKind,
      myRole: me.myRole,
      // L2: every booking's pickup, and the booking form's map centre and fare quote.
      location: (merchant.location as Waypoint | null) ?? null,
      // L4: who is signed in, as the team knows them.
      ...(me.myName ? { myName: me.myName } : {}),
      // D-48: closed by hand (only while it still holds).
      closedUntil: merchant.closedUntil && merchant.closedUntil.getTime() > Date.now() ? merchant.closedUntil.toISOString() : null,
      autoAccept: merchant.autoAccept,
      showPhoneToCustomers: merchant.showPhoneToCustomers,
    };
  }

  private toCategoryResponse(category: CategoryRow): MerchantCategoryResponse {
    return {
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      availableFrom: category.availableFrom,
      availableTo: category.availableTo,
      hidden: category.hidden,
      dishCount: category._count.dishes,
    };
  }

  private async toDishResponse(dish: DishRow): Promise<MerchantDishResponse> {
    return {
      id: dish.id,
      categoryId: dish.categoryId,
      name: dish.name,
      description: dish.description,
      priceUsd: Number(dish.priceUsd),
      photoUrl: await this.signPhoto(dish.photoUrl),
      isDraft: dish.isDraft,
      outOfStock: isOutOfStock(dish),
      outOfStockUntil: isOutOfStock(dish) ? (dish.outOfStockUntil?.toISOString() ?? null) : null,
      sortOrder: dish.sortOrder,
    };
  }

  // Customer-facing photos must be V4 signed read URLs, same as the merchant-facing responses above:
  // the media bucket enforces public_access_prevention, so the raw GCS object key these fields used
  // to pass through could never render on a customer's phone (plan §10 blocker, 2026-07-31).
  private async toListItem(
    merchant: Pick<
      MerchantWithOwner,
      "id" | "name" | "coverPhotoUrl" | "logoUrl" | "cuisineTags" | "priceLevel" | "hours" | "location" | "foodRatingAvg" | "foodRatingCount" | "prepBaselineMinutes" | "closedUntil"
    >,
  ): Promise<RestaurantListItem> {
    const location = (merchant.location as Waypoint | null) ?? null;
    const [coverPhotoUrl, logoUrl] = await Promise.all([this.signPhoto(merchant.coverPhotoUrl), this.signPhoto(merchant.logoUrl)]);
    return {
      id: merchant.id,
      name: merchant.name,
      coverPhotoUrl,
      logoUrl,
      cuisineTags: merchant.cuisineTags,
      priceLevel: merchant.priceLevel,
      // D-48: a merchant closed by hand is served with today's window dropped, so every client —
      // installed apps included — reads it as closed and says when it opens next.
      hours: effectiveMerchantHours((merchant.hours as MerchantHours | null) ?? null, merchant.closedUntil, new Date()),
      // Geo-point only (D-17) — see the field's doc comment in contracts.ts.
      location: location ? location.point : null,
      // #673: star rating (null while unrated — the card shows no star, never a fake "0") + the
      // merchant's prep baseline for the client-side ETA.
      ratingAvg: merchant.foodRatingCount > 0 ? merchant.foodRatingAvg : null,
      ratingCount: merchant.foodRatingCount,
      prepBaselineMinutes: merchant.prepBaselineMinutes,
    };
  }

  private async toCustomerDish(dish: DishRow): Promise<RestaurantMenuDish> {
    return {
      id: dish.id,
      name: dish.name,
      description: dish.description,
      priceUsd: Number(dish.priceUsd),
      photoUrl: await this.signPhoto(dish.photoUrl),
      outOfStock: isOutOfStock(dish),
    };
  }
}

/** A second sign-up by someone already on a business — including a lost-response retry of their own
 *  first sign-up, which the web treats as success. */
function alreadyMember(): ConflictException {
  return new ConflictException({ reason: "already_member", message: "This number is already on a business on LyniaGo" });
}
