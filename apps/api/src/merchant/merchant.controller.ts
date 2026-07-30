import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import {
  BecomeMerchantRequest,
  MerchantCategoryRequest,
  MerchantDishRequest,
  SetMerchantBusyModeRequest,
  UpdateMerchantCashRuleRequest,
  UpdateMerchantCategoryRequest,
  UpdateMerchantDishRequest,
  UpdateMerchantHoursRequest,
  UpdateMerchantLocationRequest,
  UpdateMerchantProfileRequest,
} from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { MerchantGuard } from "./merchant.guard";
import { MerchantService } from "./merchant.service";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Merchant self-service surface (Lane C, C1). Every handler sits behind RestaurantsEnabledGuard —
 * the vertical's fail-safe-OFF kill switch — ahead of auth, so a disabled vertical 503s before a
 * bearer token is even inspected (see restaurants-enabled.guard.ts). All routes but `become` also
 * require MerchantGuard: a caller must already hold a merchant JWT (minted the moment `become`
 * upgrades their profile's role in place — the same becomeRider shape, reusing the existing
 * phone+OTP auth unchanged).
 */
@Controller("merchant")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard)
export class MerchantController {
  constructor(private readonly merchant: MerchantService) {}

  // Mirrors POST /riders/become's throttle rationale: an unthrottled onboarding route is a cheap
  // flood vector even though it costs no paid vendor call here.
  @Throttle({ limit: 5, windowSec: 3600, keyPrefix: "merchant-become" })
  @Post("become")
  become(@Body(new ZodBody(BecomeMerchantRequest)) body: BecomeMerchantRequest, @CurrentUser() profileId: string) {
    return this.merchant.becomeMerchant(profileId, body);
  }

  @Get("me")
  @UseGuards(MerchantGuard)
  me(@CurrentUser() profileId: string) {
    return this.merchant.getMyMerchant(profileId);
  }

  // E3: money surfaces — weekly statement + end-of-day summary (N-13).
  @Get("statement/weekly")
  @UseGuards(MerchantGuard)
  weeklyStatement(@CurrentUser() profileId: string) {
    return this.merchant.getWeeklyStatement(profileId);
  }

  @Get("summary/today")
  @UseGuards(MerchantGuard)
  todaySummary(@CurrentUser() profileId: string) {
    return this.merchant.getTodaySummary(profileId);
  }

  @Patch("profile")
  @UseGuards(MerchantGuard)
  updateProfile(
    @Body(new ZodBody(UpdateMerchantProfileRequest)) body: UpdateMerchantProfileRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.merchant.updateProfile(profileId, body);
  }

  @Patch("hours")
  @UseGuards(MerchantGuard)
  updateHours(
    @Body(new ZodBody(UpdateMerchantHoursRequest)) body: UpdateMerchantHoursRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.merchant.updateHours(profileId, body);
  }

  @Patch("location")
  @UseGuards(MerchantGuard)
  updateLocation(
    @Body(new ZodBody(UpdateMerchantLocationRequest)) body: UpdateMerchantLocationRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.merchant.updateLocation(profileId, body);
  }

  @Patch("cash-rule")
  @UseGuards(MerchantGuard)
  updateCashRule(
    @Body(new ZodBody(UpdateMerchantCashRuleRequest)) body: UpdateMerchantCashRuleRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.merchant.updateCashRule(profileId, body);
  }

  @Patch("busy-mode")
  @UseGuards(MerchantGuard)
  setBusyMode(
    @Body(new ZodBody(SetMerchantBusyModeRequest)) body: SetMerchantBusyModeRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.merchant.setBusyMode(profileId, body);
  }

  @Get("categories")
  @UseGuards(MerchantGuard)
  listCategories(@CurrentUser() profileId: string) {
    return this.merchant.listCategories(profileId);
  }

  @Post("categories")
  @UseGuards(MerchantGuard)
  createCategory(
    @Body(new ZodBody(MerchantCategoryRequest)) body: MerchantCategoryRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.merchant.createCategory(profileId, body);
  }

  @Patch("categories/:id")
  @UseGuards(MerchantGuard)
  updateCategory(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(UpdateMerchantCategoryRequest)) body: UpdateMerchantCategoryRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.merchant.updateCategory(profileId, id, body);
  }

  @Delete("categories/:id")
  @UseGuards(MerchantGuard)
  @HttpCode(200)
  deleteCategory(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() profileId: string) {
    return this.merchant.deleteCategory(profileId, id);
  }

  @Post("dishes")
  @UseGuards(MerchantGuard)
  createDish(@Body(new ZodBody(MerchantDishRequest)) body: MerchantDishRequest, @CurrentUser() profileId: string) {
    return this.merchant.createDish(profileId, body);
  }

  @Patch("dishes/:id")
  @UseGuards(MerchantGuard)
  updateDish(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(UpdateMerchantDishRequest)) body: UpdateMerchantDishRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.merchant.updateDish(profileId, id, body);
  }

  @Delete("dishes/:id")
  @UseGuards(MerchantGuard)
  @HttpCode(200)
  deleteDish(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() profileId: string) {
    return this.merchant.deleteDish(profileId, id);
  }

  @Post("dishes/:id/out-of-stock")
  @UseGuards(MerchantGuard)
  setOutOfStock(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() profileId: string) {
    return this.merchant.setDishOutOfStock(profileId, id);
  }

  @Delete("dishes/:id/out-of-stock")
  @UseGuards(MerchantGuard)
  @HttpCode(200)
  clearOutOfStock(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() profileId: string) {
    return this.merchant.clearDishOutOfStock(profileId, id);
  }
}
