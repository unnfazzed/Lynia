import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AddMerchantRiderRequest, type MerchantPreferredRiderResponse, type MerchantRidersResponse } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import type { MerchantAccess } from "./merchant-access";
import { MerchantRidersService } from "./merchant-riders.service";
import { CurrentMerchantAccess, MerchantGuard, OwnerOnly } from "./merchant.guard";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Your riders (merchant web upgrade L3). Behind the same chain as every merchant route. The whole team
 * can see the list; only the owner changes it (design doc L3, plan D3's permission table).
 */
@Controller("merchant/riders")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard, MerchantGuard)
export class MerchantRidersController {
  constructor(private readonly riders: MerchantRidersService) {}

  @Get()
  list(@CurrentMerchantAccess() access: MerchantAccess): Promise<MerchantRidersResponse> {
    return this.riders.list(access);
  }

  // The business-wide daily limit lives in the service; this only stops a burst from one person.
  @Post()
  @OwnerOnly()
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "merchant-rider-add" })
  add(
    @Body(new ZodBody(AddMerchantRiderRequest)) body: AddMerchantRiderRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<MerchantPreferredRiderResponse> {
    return this.riders.add(access, profileId, body);
  }

  @Delete(":id")
  @OwnerOnly()
  @HttpCode(200)
  remove(@Param("id", ParseUUIDPipe) id: string, @CurrentMerchantAccess() access: MerchantAccess, @CurrentUser() profileId: string): Promise<{ ok: true }> {
    return this.riders.remove(access, profileId, id);
  }
}
