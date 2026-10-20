import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  ConvertFleetBookingRequest,
  CreateFleetBookingRequest,
  type CreateFleetBookingResponse,
  CreateFleetInviteRequest,
  type FleetBillsResponse,
  type FleetInviteLinkResponse,
  type FleetRidesResponse,
  type FleetJobOffersResponse,
  type MerchantBookingResponse,
  type FleetMoneyResponse,
  type MyFleetResponse,
  OpenFleetInviteRequest,
  type OwnerFleetResponse,
} from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { FleetDispatchService } from "./fleet-dispatch.service";
import { FleetService } from "./fleet.service";
import { MerchantBookingService } from "./merchant-booking.service";
import type { MerchantAccess } from "./merchant-access";
import { CurrentMerchantAccess, MerchantGuard, OwnerOnly } from "./merchant.guard";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Own bikers (D-117, handoff own-bikers-v1 OB-M1–M12), the business's side. The roster is read by owner and staff
 * (staff read-only, E6); inviting, revoking, removing and dismissing suggestions are owner-only (E4, E13). "My
 * bikers" bookings are any member's, like every booking (plan D3).
 */
@Controller("merchant/fleet")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard, MerchantGuard)
export class MerchantFleetController {
  constructor(
    private readonly fleet: FleetService,
    private readonly bookings: MerchantBookingService,
  ) {}

  @Get()
  roster(@CurrentMerchantAccess() access: MerchantAccess): Promise<OwnerFleetResponse> {
    return this.fleet.roster(access);
  }

  /** OB-M13 Money · Fleet rides (owner and staff): this branch's rides for a week (`?week=YYYY-MM-DD`). */
  @Get("rides")
  rides(@CurrentMerchantAccess() access: MerchantAccess, @Query("week") week?: string): Promise<FleetRidesResponse> {
    return this.fleet.rides(access, week);
  }

  /** OB-M14 the fleet bill (owner only, E6). */
  @Get("bills")
  @OwnerOnly()
  bills(@CurrentMerchantAccess() access: MerchantAccess): Promise<FleetBillsResponse> {
    return this.fleet.bills(access);
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

  /** OB-M8 "Ring my bikers". Same budget as Any biker's create. */
  @Post("bookings")
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "merchant-booking-create" })
  book(
    @Body(new ZodBody(CreateFleetBookingRequest)) body: CreateFleetBookingRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<CreateFleetBookingResponse> {
    return this.bookings.createFleet(access, profileId, body);
  }

  /** OB-M10 "Try my bikers again". */
  @Post("bookings/:id/retry")
  @HttpCode(200)
  retry(@Param("id", ParseUUIDPipe) id: string, @CurrentMerchantAccess() access: MerchantAccess): Promise<MerchantBookingResponse> {
    return this.bookings.fleetRetry(access, id);
  }

  /** OB-M10/M11 "Send to any biker": the same booking, now the public auction at this fare. */
  @Post("bookings/:id/any-biker")
  @HttpCode(200)
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "merchant-booking-create" })
  anyBiker(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ConvertFleetBookingRequest)) body: ConvertFleetBookingRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<MerchantBookingResponse> {
    return this.bookings.fleetConvert(access, profileId, id, body.proposedFare);
  }
}

/**
 * Own bikers (D-117, OB-R1–R3, R12), the biker's side. Not behind MerchantGuard: a biker isn't on a business team
 * (OV-F8 refuses anyone who is on one of the owner's).
 */
@Controller("fleet")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard)
export class RiderFleetController {
  constructor(
    private readonly fleet: FleetService,
    private readonly dispatch: FleetDispatchService,
  ) {}

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

  /** OB-R10: the cash the biker holds for the business, and its recent movements. */
  @Get("money")
  money(@CurrentUser() profileId: string): Promise<FleetMoneyResponse> {
    return this.fleet.money(profileId);
  }

  @Post("leave")
  @HttpCode(200)
  leave(@CurrentUser() profileId: string): Promise<{ ok: true }> {
    return this.fleet.leave(profileId);
  }

  /** OB-R4/R5: the biker's live job offers (the poll and reconnect fallback for `fleet:offer`). */
  @Get("jobs/offers")
  async offers(@CurrentUser() profileId: string): Promise<FleetJobOffersResponse> {
    return { offers: await this.dispatch.offersFor(profileId) };
  }

  /** OB-R5 "Accept this job": the first of the round to accept takes it. */
  @Post("jobs/:orderId/accept")
  @HttpCode(200)
  @Throttle({ limit: 30, windowSec: 60, keyPrefix: "fleet-job-accept" })
  accept(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string): Promise<{ orderId: string; status: "assigned" }> {
    return this.dispatch.accept(orderId, profileId);
  }

  /** OB-R5 "Not this one": no cost to the biker. */
  @Post("jobs/:orderId/decline")
  @HttpCode(200)
  decline(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string): Promise<{ orderId: string; declined: true }> {
    return this.dispatch.decline(orderId, profileId);
  }
}
