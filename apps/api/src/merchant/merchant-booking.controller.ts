import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  CancelMerchantBookingRequest,
  CloseMerchantBookingCashRequest,
  CreateMerchantBookingRequest,
  type MerchantBookingResponse,
  type PickMerchantBookingOfferResponse,
  ResolveMapLinkRequest,
  type ResolveMapLinkResponse,
  RetryMerchantBookingRequest,
  type RotateMerchantBookingCodeResponse,
} from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import type { MerchantAccess } from "./merchant-access";
import { MerchantBookingService } from "./merchant-booking.service";
import { CurrentMerchantAccess, MerchantGuard } from "./merchant.guard";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Book a rider (merchant web upgrade L2). Behind the same chain as every merchant route —
 * RestaurantsEnabledGuard (so the kill switch also stops bookings; plan §11 F1.4), JwtAuthGuard, then
 * MerchantGuard's membership read. Staff may book and act on any booking (plan D3), so nothing here is
 * @OwnerOnly.
 */
@Controller("merchant/bookings")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard, MerchantGuard)
export class MerchantBookingController {
  constructor(private readonly bookings: MerchantBookingService) {}

  @Get()
  list(@CurrentMerchantAccess() access: MerchantAccess): Promise<MerchantBookingResponse[]> {
    return this.bookings.list(access);
  }

  // Same budget as Send's own POST /orders ("order-create"): each booking pushes every nearby rider.
  @Post()
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "merchant-booking-create" })
  create(
    @Body(new ZodBody(CreateMerchantBookingRequest)) body: CreateMerchantBookingRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<MerchantBookingResponse> {
    return this.bookings.create(access, profileId, body);
  }

  // T15: the one route that makes an outbound request, so it is throttled per member.
  @Post("resolve-link")
  @HttpCode(200)
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "merchant-map-link" })
  async resolveLink(@Body(new ZodBody(ResolveMapLinkRequest)) body: ResolveMapLinkRequest): Promise<ResolveMapLinkResponse> {
    return { point: await this.bookings.resolveLink(body.url) };
  }

  @Get(":id")
  detail(@Param("id", ParseUUIDPipe) id: string, @CurrentMerchantAccess() access: MerchantAccess): Promise<MerchantBookingResponse> {
    return this.bookings.detail(access, id);
  }

  @Post(":id/offers/:offerId/pick")
  @HttpCode(200)
  pick(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("offerId", ParseUUIDPipe) offerId: string,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<PickMerchantBookingOfferResponse> {
    return this.bookings.pick(access, profileId, id, offerId);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(CancelMerchantBookingRequest)) body: CancelMerchantBookingRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<MerchantBookingResponse> {
    return this.bookings.cancel(access, profileId, id, body.reason);
  }

  /** "Send a new code" — the new code replaces the old one. */
  @Post(":id/code")
  @HttpCode(200)
  @Throttle({ limit: 10, windowSec: 60, keyPrefix: "merchant-booking-code" })
  rotateCode(@Param("id", ParseUUIDPipe) id: string, @CurrentMerchantAccess() access: MerchantAccess): Promise<RotateMerchantBookingCodeResponse> {
    return this.bookings.rotateCode(access, id);
  }

  /** D-48 PR 4b (D7): "I got $X" or "No cash on this one" on a cash-on-delivery booking. */
  @Post(":id/cash")
  @HttpCode(200)
  closeCash(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(CloseMerchantBookingCashRequest)) body: CloseMerchantBookingCashRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
  ): Promise<MerchantBookingResponse> {
    return this.bookings.closeCash(access, id, body);
  }

  @Post(":id/try-again")
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "merchant-booking-create" })
  retry(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(RetryMerchantBookingRequest)) body: RetryMerchantBookingRequest,
    @CurrentMerchantAccess() access: MerchantAccess,
    @CurrentUser() profileId: string,
  ): Promise<MerchantBookingResponse> {
    return this.bookings.retry(access, profileId, id, body);
  }
}
