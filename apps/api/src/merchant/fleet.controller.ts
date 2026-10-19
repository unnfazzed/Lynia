import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  CreateFleetInviteRequest,
  type FleetInviteLinkResponse,
  type MyFleetResponse,
  OpenFleetInviteRequest,
  type OwnerFleetResponse,
} from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { FleetEnabledGuard } from "./fleet-enabled.guard";
import { FleetService } from "./fleet.service";
import type { MerchantAccess } from "./merchant-access";
import { CurrentMerchantAccess, MerchantGuard, OwnerOnly } from "./merchant.guard";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Own bikers (D-117, handoff own-bikers-v1 OB-M1–M7), the business's side. The roster is read by owner and staff
 * (staff read-only, E6); inviting, revoking, removing and dismissing suggestions are owner-only (E4, E13).
 */
@Controller("merchant/fleet")
@UseGuards(RestaurantsEnabledGuard, FleetEnabledGuard, JwtAuthGuard, MerchantGuard)
export class MerchantFleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get()
  roster(@CurrentMerchantAccess() access: MerchantAccess): Promise<OwnerFleetResponse> {
    return this.fleet.roster(access);
  }

  // The per-owner daily limit lives in the service; this only stops a burst from one person.
  @Post("invites")
  @OwnerOnly()
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "merchant-fleet-invite" })
  invite(
    @Body(new ZodBody(CreateFleetInviteRequest)) body: CreateFleetInviteRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<FleetInviteLinkResponse> {
    return this.fleet.invite(access, profileId, body);
  }

  /** "Share again". */
  @Get("invites/:id/link")
  @OwnerOnly()
  link(@Param("id", ParseUUIDPipe) id: string, @CurrentMerchantAccess() access: MerchantAccess): Promise<FleetInviteLinkResponse> {
    return this.fleet.inviteLink(access, id);
  }

  @Post("invites/:id/revoke")
  @OwnerOnly()
  @HttpCode(200)
  revoke(@Param("id", ParseUUIDPipe) id: string, @CurrentMerchantAccess() access: MerchantAccess, @CurrentUser() profileId: string): Promise<{ ok: true }> {
    return this.fleet.revokeInvite(access, profileId, id);
  }

  @Delete("bikers/:riderId")
  @OwnerOnly()
  @HttpCode(200)
  remove(
    @Param("riderId", ParseUUIDPipe) riderId: string,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<{ ok: true }> {
    return this.fleet.removeBiker(access, profileId, riderId);
  }

  @Post("suggestions/dismiss")
  @OwnerOnly()
  @HttpCode(200)
  dismissSuggestions(@CurrentMerchantAccess() access: MerchantAccess): Promise<{ ok: true }> {
    return this.fleet.dismissSuggestions(access);
  }
}

/**
 * Own bikers (D-117, OB-R1–R3, R12), the biker's side. Not behind MerchantGuard: a biker isn't on a business team
 * (OV-F8 refuses anyone who is on one of the owner's).
 */
@Controller("fleet")
@UseGuards(RestaurantsEnabledGuard, FleetEnabledGuard, JwtAuthGuard)
export class RiderFleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get("me")
  mine(@CurrentUser() profileId: string): Promise<MyFleetResponse> {
    return this.fleet.mine(profileId);
  }

  /** The app opened an invite link. Throttled: a code is a secret, so guessing must be slow. */
  @Post("invites/open")
  @HttpCode(200)
  @Throttle({ limit: 10, windowSec: 60, keyPrefix: "fleet-invite-open" })
  open(@Body(new ZodBody(OpenFleetInviteRequest)) body: OpenFleetInviteRequest, @CurrentUser() profileId: string): Promise<MyFleetResponse> {
    return this.fleet.open(profileId, body.code);
  }

  @Post("invites/:id/join")
  @HttpCode(200)
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "fleet-invite-join" })
  join(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() profileId: string): Promise<MyFleetResponse> {
    return this.fleet.join(profileId, id);
  }

  @Post("leave")
  @HttpCode(200)
  leave(@CurrentUser() profileId: string): Promise<{ ok: true }> {
    return this.fleet.leave(profileId);
  }
}
