import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  BecomeMerchantRequest,
  MerchantCategoryRequest,
  MerchantCategoryResponse,
  MerchantDishRequest,
  MerchantDishResponse,
  MerchantEndOfDaySummaryResponse,
  MerchantHours,
  MerchantPaymentMethod,
  MerchantProfileResponse,
  MerchantStatementLineItem,
  MerchantWeeklyStatementResponse,
  RestaurantListItem,
  RestaurantListResponse,
  RestaurantMenuDish,
  RestaurantMenuResponse,
  SetMerchantBusyModeRequest,
  UpdateMerchantCashRuleRequest,
  UpdateMerchantCategoryRequest,
  UpdateMerchantDishRequest,
  UpdateMerchantHoursRequest,
  UpdateMerchantLocationRequest,
  UpdateMerchantProfileRequest,
  Waypoint,
} from "@lynia/shared";
import { RESTAURANTS_COMMISSION, roundToCents } from "@lynia/shared";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { maskPhone } from "../common/phone-mask";
import { PrismaService } from "../prisma/prisma.service";
import { isDishOutOfStock as isOutOfStock, resolveOwnMerchantId } from "./merchant-lookup.util";

type MerchantWithOwner = Prisma.MerchantGetPayload<{ include: { ownerProfile: { select: { phone: true } } } }>;
type DishRow = Prisma.MerchantDishGetPayload<Record<string, never>>;
type CategoryRow = Prisma.MerchantCategoryGetPayload<{ include: { _count: { select: { dishes: true } } } }>;
type PlainCategoryRow = Prisma.MerchantCategoryGetPayload<Record<string, never>>;

// E4/D-32: `coverPhotoUrl`/`logoUrl`/dish `photoUrl` persist the raw GCS object KEY (the bucket has
// no public objects — infra/terraform/storage.tf enforces `public_access_prevention = "enforced"`,
// every read goes through a V4 signed URL), the same shape rider KYC photos already use
// (admin-kyc-review.service.ts). Long enough that a merchant editing their menu for a while doesn't
// see photos expire mid-session; short enough that a leaked/cached tablet response can't be replayed
// indefinitely.
const PHOTO_READ_URL_TTL_SECONDS = 60 * 60;

/** N-14: "for the rest of today" — end of the server's local calendar day. A past timestamp reads as
 *  back-in-stock, so no reset job is needed; this is the only place that boundary is computed. */
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

@Injectable()
export class MerchantService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  /** Upgrade a customer profile to a merchant owner + create the Merchant row — mirrors
   *  RiderService.becomeRider exactly (same conflict shape, same atomic role+row transaction). */
  async becomeMerchant(profileId: string, body: BecomeMerchantRequest): Promise<MerchantProfileResponse> {
    const existing = await this.prisma.merchant.findUnique({ where: { ownerProfileId: profileId }, select: { id: true } });
    if (existing) {
      throw new ConflictException({ reason: "already_merchant", message: "Already registered as a merchant" });
    }

    try {
      await this.prisma.$transaction([
        this.prisma.profile.update({ where: { id: profileId }, data: { role: "merchant" } }),
        this.prisma.merchant.create({
          data: { name: body.name, ownerProfileId: profileId, cashRule: body.cashRule ?? "collect_and_return" },
        }),
      ]);
      return await this.toProfileResponse(await this.findOwnMerchantOrThrow(profileId));
    } catch (err) {
      // The unique index on ownerProfileId is the real guard against a concurrent duplicate become
      // (the pre-check above races it) — map its P2002 to the same conflict shape.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException({ reason: "already_merchant", message: "Already registered as a merchant" });
      }
      throw err;
    }
  }

  async getMyMerchant(profileId: string): Promise<MerchantProfileResponse> {
    return await this.toProfileResponse(await this.findOwnMerchantOrThrow(profileId));
  }

  async updateProfile(profileId: string, body: UpdateMerchantProfileRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const data: Prisma.MerchantUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.coverPhotoUrl !== undefined) data.coverPhotoUrl = body.coverPhotoUrl;
    if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl;
    if (body.cuisineTags !== undefined) data.cuisineTags = body.cuisineTags;
    if (body.priceLevel !== undefined) data.priceLevel = body.priceLevel;
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data,
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated);
  }

  async updateHours(profileId: string, body: UpdateMerchantHoursRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { hours: body.hours as Prisma.InputJsonValue },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated);
  }

  async updateCashRule(profileId: string, body: UpdateMerchantCashRuleRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { cashRule: body.cashRule },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated);
  }

  /** C2: the shop's own pickup point — required before placeOrder can price a trip (N-01 needs a
   *  distance). Same Waypoint shape as a parcel's pickup. */
  async updateLocation(profileId: string, body: UpdateMerchantLocationRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { location: body.location as Prisma.InputJsonValue },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated);
  }

  /** For FoodOrderService.placeOrder — the merchant's pickup point, or null if not set yet. */
  async findLocation(merchantId: string): Promise<Waypoint | null> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { location: true } });
    return (merchant?.location as Waypoint | null) ?? null;
  }

  async setBusyMode(profileId: string, body: SetMerchantBusyModeRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { busyMode: body.active },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return await this.toProfileResponse(updated);
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
    await this.findOwnDishOrThrow(merchantId, dishId);

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

  async setDishOutOfStock(profileId: string, dishId: string): Promise<MerchantDishResponse> {
    return this.writeDishOutOfStock(profileId, dishId, endOfToday());
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

  async listRestaurants(): Promise<RestaurantListResponse> {
    const merchants = await this.prisma.merchant.findMany({ where: { pilotEnabled: true }, orderBy: { name: "asc" } });
    return { restaurants: merchants.map((m) => this.toListItem(m)) };
  }

  async getRestaurantMenu(merchantId: string): Promise<RestaurantMenuResponse> {
    const merchant = await this.prisma.merchant.findFirst({ where: { id: merchantId, pilotEnabled: true } });
    if (!merchant) throw new NotFoundException("Restaurant not found");
    const categories = await this.prisma.merchantCategory.findMany({
      where: { merchantId: merchant.id, hidden: false },
      orderBy: { sortOrder: "asc" },
      // D-31: draft (photoless) dishes are excluded entirely from the customer read API.
      include: { dishes: { where: { isDraft: false }, orderBy: { sortOrder: "asc" } } },
    });
    return {
      restaurant: this.toListItem(merchant),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        dishes: c.dishes.map((d) => this.toCustomerDish(d)),
      })),
    };
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

    const [delivered, rejected, walletTaken, cashTaken, prepped] = await Promise.all([
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
    ]);

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
    };
  }

  private async findOwnMerchantOrThrow(profileId: string): Promise<MerchantWithOwner> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { ownerProfileId: profileId },
      include: { ownerProfile: { select: { phone: true } } },
    });
    if (!merchant) throw new NotFoundException("Merchant not found");
    return merchant;
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

  /** Best-effort read-URL mint (mirrors admin-kyc-review.service.ts's photoUrl handling): a signing
   *  hiccup shouldn't block the rest of the response from loading, it just means the photo doesn't
   *  render this once. `null`/missing key never calls storage at all. */
  private async signPhoto(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;
    return this.storage.createReadUrl(key, PHOTO_READ_URL_TTL_SECONDS).catch(() => null);
  }

  private async toProfileResponse(merchant: MerchantWithOwner): Promise<MerchantProfileResponse> {
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
      sortOrder: dish.sortOrder,
    };
  }

  private toListItem(
    merchant: Pick<MerchantWithOwner, "id" | "name" | "coverPhotoUrl" | "logoUrl" | "cuisineTags" | "priceLevel" | "hours" | "location">,
  ): RestaurantListItem {
    const location = (merchant.location as Waypoint | null) ?? null;
    return {
      id: merchant.id,
      name: merchant.name,
      coverPhotoUrl: merchant.coverPhotoUrl,
      logoUrl: merchant.logoUrl,
      cuisineTags: merchant.cuisineTags,
      priceLevel: merchant.priceLevel,
      hours: (merchant.hours as MerchantHours | null) ?? null,
      // Geo-point only (D-17) — see the field's doc comment in contracts.ts.
      location: location ? location.point : null,
    };
  }

  private toCustomerDish(dish: DishRow): RestaurantMenuDish {
    return {
      id: dish.id,
      name: dish.name,
      description: dish.description,
      priceUsd: Number(dish.priceUsd),
      photoUrl: dish.photoUrl,
      outOfStock: isOutOfStock(dish),
    };
  }
}
