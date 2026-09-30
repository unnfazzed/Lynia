import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import {
  CreateMerchantBranchRequest,
  type MerchantBranchesResponse,
  type MerchantProfileResponse,
  SwitchMerchantBranchRequest,
} from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import type { MerchantAccess } from "./merchant-access";
import { MerchantBranchesService } from "./merchant-branches.service";
import { CurrentMerchantAccess, MerchantGuard, OwnerOnly } from "./merchant.guard";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Multi-branch owners (docs/plans/2026-09-30-multi-branch-owners.md): the branch list, switching, and an
 * owner opening a new branch. Anyone on a business can list and switch (a person on one business has a
 * list of one); opening a branch is owner-only.
 */
@Controller("merchant/branches")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard, MerchantGuard)
export class MerchantBranchesController {
  constructor(private readonly branches: MerchantBranchesService) {}

  @Get()
  list(@CurrentUser() profileId: string): Promise<MerchantBranchesResponse> {
    return this.branches.list(profileId);
  }

  @Post("switch")
  @HttpCode(200)
  switchTo(
    @Body(new ZodBody(SwitchMerchantBranchRequest)) body: SwitchMerchantBranchRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<MerchantProfileResponse> {
    return this.branches.switchTo(access, profileId, body);
  }

  @Post()
  @OwnerOnly()
  @Throttle({ limit: 5, windowSec: 60, keyPrefix: "merchant-branch-create" })
  create(
    @Body(new ZodBody(CreateMerchantBranchRequest)) body: CreateMerchantBranchRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<MerchantProfileResponse> {
    return this.branches.create(access, profileId, body);
  }
}
