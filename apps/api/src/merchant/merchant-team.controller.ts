import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  CreateMerchantInviteRequest,
  SetMerchantPharmacistRequest,
  JoinMerchantInviteRequest,
  type MerchantProfileResponse,
  type MerchantTeamInviteResponse,
  type MerchantTeamResponse,
  type MyMerchantInvitesResponse,
} from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import type { MerchantAccess } from "./merchant-access";
import { MerchantInvitesService } from "./merchant-invites.service";
import { MerchantTeamService } from "./merchant-team.service";
import { CurrentMerchantAccess, MerchantGuard, OwnerOnly } from "./merchant.guard";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Team (merchant web upgrade L4), the business's side. Team is an owner-only row of the permission table
 * (docs/designs/merchant-web-upgrade.md L4); the one thing Staff do here is leave.
 */
@Controller("merchant/team")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard, MerchantGuard)
export class MerchantTeamController {
  constructor(private readonly team: MerchantTeamService) {}

  @Get()
  @OwnerOnly()
  list(@CurrentMerchantAccess() access: MerchantAccess, @CurrentUser() profileId: string): Promise<MerchantTeamResponse> {
    return this.team.team(access, profileId);
  }

  // The business-wide daily limit lives in the service; this only stops a burst from one person.
  @Post("invites")
  @OwnerOnly()
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "merchant-team-invite" })
  invite(
    @Body(new ZodBody(CreateMerchantInviteRequest)) body: CreateMerchantInviteRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<MerchantTeamInviteResponse> {
    return this.team.invite(access, profileId, body);
  }

  @Delete("invites/:id")
  @OwnerOnly()
  @HttpCode(200)
  cancelInvite(@Param("id", ParseUUIDPipe) id: string, @CurrentMerchantAccess() access: MerchantAccess, @CurrentUser() profileId: string): Promise<{ ok: true }> {
    return this.team.cancelInvite(access, profileId, id);
  }

  @Delete("members/:profileId")
  @OwnerOnly()
  @HttpCode(200)
  removeMember(
    @Param("profileId", ParseUUIDPipe) memberProfileId: string,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<{ ok: true }> {
    return this.team.removeMember(access, profileId, memberProfileId);
  }

  /** Order flow v2 (BRIEF §13): who may approve or decline prescriptions (pharmacies). */
  @Post("members/:profileId/pharmacist")
  @OwnerOnly()
  @HttpCode(200)
  setPharmacist(
    @Param("profileId", ParseUUIDPipe) memberProfileId: string,
    @Body(new ZodBody(SetMerchantPharmacistRequest)) body: SetMerchantPharmacistRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
  ): Promise<{ ok: true }> {
    return this.team.setPharmacist(access, memberProfileId, body.isPharmacist);
  }

  /** "Leave this business" (Staff). */
  @Post("leave")
  @HttpCode(200)
  leave(@CurrentMerchantAccess() access: MerchantAccess, @CurrentUser() profileId: string): Promise<{ ok: true }> {
    return this.team.leave(access, profileId);
  }
}

/**
 * Team (merchant web upgrade L4), the invited person's side. Not behind MerchantGuard: the caller isn't
 * on a business yet, which is the point.
 */
@Controller("merchant/invites")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard)
export class MerchantInvitesController {
  constructor(private readonly invites: MerchantInvitesService) {}

  @Get()
  mine(@CurrentUser() profileId: string): Promise<MyMerchantInvitesResponse> {
    return this.invites.mine(profileId);
  }

  @Post(":id/join")
  @HttpCode(200)
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "merchant-invite-join" })
  join(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(JoinMerchantInviteRequest)) body: JoinMerchantInviteRequest,
    @CurrentUser() profileId: string,
  ): Promise<MerchantProfileResponse> {
    return this.invites.join(profileId, id, body);
  }

  /** "Not me". */
  @Post(":id/decline")
  @HttpCode(200)
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "merchant-invite-join" })
  decline(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() profileId: string): Promise<{ ok: true }> {
    return this.invites.decline(profileId, id);
  }
}
