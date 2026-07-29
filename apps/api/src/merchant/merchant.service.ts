import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  BecomeMerchantRequest,
  MerchantCategoryRequest,
  MerchantCategoryResponse,
  MerchantDishRequest,
  MerchantDishResponse,
  MerchantHours,
  MerchantProfileResponse,
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
import { maskPhone } from "../common/phone-mask";
import { PrismaService } from "../prisma/prisma.service";

type MerchantWithOwner = Prisma.MerchantGetPayload<{ include: { ownerProfile: { select: { phone: true } } } }>;
type DishRow = Prisma.MerchantDishGetPayload<Record<string, never>>;
type CategoryRow = Prisma.MerchantCategoryGetPayload<{ include: { _count: { select: { dishes: true } } } }>;

/** N-14: "for the rest of today" — end of the server's local calendar day. A past timestamp reads as
 *  back-in-stock, so no reset job is needed; this is the only place that boundary is computed. */
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function isOutOfStock(dish: Pick<DishRow, "outOfStockUntil">): boolean {
  return !!dish.outOfStockUntil && dish.outOfStockUntil > new Date();
}

@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

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
      return this.toProfileResponse(await this.findOwnMerchantOrThrow(profileId));
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
    return this.toProfileResponse(await this.findOwnMerchantOrThrow(profileId));
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
    return this.toProfileResponse(updated);
  }

  async updateHours(profileId: string, body: UpdateMerchantHoursRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { hours: body.hours as Prisma.InputJsonValue },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return this.toProfileResponse(updated);
  }

  async updateCashRule(profileId: string, body: UpdateMerchantCashRuleRequest): Promise<MerchantProfileResponse> {
    const merchant = await this.findOwnMerchantOrThrow(profileId);
    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { cashRule: body.cashRule },
      include: { ownerProfile: { select: { phone: true } } },
    });
    return this.toProfileResponse(updated);
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
    return this.toProfileResponse(updated);
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
    return this.toProfileResponse(updated);
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
    const existing = await this.prisma.merchantCategory.findFirst({ where: { id: categoryId, merchantId } });
    if (!existing) throw new NotFoundException("Category not found");

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

  async createDish(profileId: string, body: MerchantDishRequest): Promise<MerchantDishResponse> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    const category = await this.prisma.merchantCategory.findFirst({ where: { id: body.categoryId, merchantId } });
    if (!category) throw new NotFoundException("Category not found");
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
    return this.toDishResponse(created);
  }

  async updateDish(profileId: string, dishId: string, body: UpdateMerchantDishRequest): Promise<MerchantDishResponse> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    const existing = await this.prisma.merchantDish.findFirst({ where: { id: dishId, merchantId } });
    if (!existing) throw new NotFoundException("Dish not found");

    const data: Prisma.MerchantDishUpdateInput = {};
    if (body.categoryId !== undefined) {
      const category = await this.prisma.merchantCategory.findFirst({ where: { id: body.categoryId, merchantId } });
      if (!category) throw new NotFoundException("Category not found");
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
    return this.toDishResponse(updated);
  }

  async deleteDish(profileId: string, dishId: string): Promise<{ ok: true }> {
    const merchantId = await this.findOwnMerchantIdOrThrow(profileId);
    const existing = await this.prisma.merchantDish.findFirst({ where: { id: dishId, merchantId } });
    if (!existing) throw new NotFoundException("Dish not found");
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
    const existing = await this.prisma.merchantDish.findFirst({ where: { id: dishId, merchantId } });
    if (!existing) throw new NotFoundException("Dish not found");
    const updated = await this.prisma.merchantDish.update({ where: { id: dishId }, data: { outOfStockUntil: until } });
    return this.toDishResponse(updated);
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

  private async findOwnMerchantOrThrow(profileId: string): Promise<MerchantWithOwner> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { ownerProfileId: profileId },
      include: { ownerProfile: { select: { phone: true } } },
    });
    if (!merchant) throw new NotFoundException("Merchant not found");
    return merchant;
  }

  private async findOwnMerchantIdOrThrow(profileId: string): Promise<string> {
    const merchant = await this.prisma.merchant.findUnique({ where: { ownerProfileId: profileId }, select: { id: true } });
    if (!merchant) throw new NotFoundException("Merchant not found");
    return merchant.id;
  }

  private toProfileResponse(merchant: MerchantWithOwner): MerchantProfileResponse {
    return {
      id: merchant.id,
      name: merchant.name,
      ownerPhoneMasked: maskPhone(merchant.ownerProfile?.phone),
      description: merchant.description,
      coverPhotoUrl: merchant.coverPhotoUrl,
      logoUrl: merchant.logoUrl,
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

  private toDishResponse(dish: DishRow): MerchantDishResponse {
    return {
      id: dish.id,
      categoryId: dish.categoryId,
      name: dish.name,
      description: dish.description,
      priceUsd: Number(dish.priceUsd),
      photoUrl: dish.photoUrl,
      isDraft: dish.isDraft,
      outOfStock: isOutOfStock(dish),
      sortOrder: dish.sortOrder,
    };
  }

  private toListItem(
    merchant: Pick<MerchantWithOwner, "id" | "name" | "coverPhotoUrl" | "logoUrl" | "cuisineTags" | "priceLevel" | "hours">,
  ): RestaurantListItem {
    return {
      id: merchant.id,
      name: merchant.name,
      coverPhotoUrl: merchant.coverPhotoUrl,
      logoUrl: merchant.logoUrl,
      cuisineTags: merchant.cuisineTags,
      priceLevel: merchant.priceLevel,
      hours: (merchant.hours as MerchantHours | null) ?? null,
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
