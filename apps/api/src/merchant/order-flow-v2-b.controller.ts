import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  ChangeOrderScheduleRequest,
  type CustomerBalanceResponse,
  DeclinePrescriptionRequest,
  type MerchantOrderResponse,
  type PrescriptionPhotosResponse,
  type ScheduleSlotsResponse,
} from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { FoodOrderService } from "./food-order.service";
import { MerchantGuard } from "./merchant.guard";
import { OrderScheduleService } from "./order-schedule.service";
import { PrescriptionService } from "./prescription.service";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Order flow v2 (ledger D-59, backend B) — the customer's new routes, beside FoodOrderController under the
 * same `restaurants` prefix and guard chain. Every venue kind uses them: a shop or pharmacy order is a
 * merchant order like a restaurant's (`POST /restaurants/:merchantId/orders` takes shops too).
 */
@Controller("restaurants")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard)
export class OrderFlowCustomerController {
  constructor(
    private readonly foodOrders: FoodOrderService,
    private readonly schedule: OrderScheduleService,
    private readonly prescriptions: PrescriptionService,
  ) {}

  /** BRIEF §12 (R5a): Today/Tomorrow slots the venue can meet. `lat`/`lng` = the drop-off, when known. */
  @Get(":merchantId/schedule-slots")
  slots(
    @Param("merchantId", ParseUUIDPipe) merchantId: string,
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
  ): Promise<ScheduleSlotsResponse> {
    return this.schedule.slotsFor(merchantId, parsePoint(lat, lng));
  }

  /** BRIEF §12 "Change time" (T13a), before the order rings. */
  @Post("orders/:orderId/schedule")
  changeSchedule(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(ChangeOrderScheduleRequest)) body: ChangeOrderScheduleRequest,
    @CurrentUser() profileId: string,
  ): Promise<MerchantOrderResponse> {
    return this.foodOrders.changeSchedule(orderId, profileId, body.scheduledFor);
  }

  /** BRIEF §13: the customer's own prescription pages (signed read URLs). */
  @Get("orders/:orderId/prescription")
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "rx-photos" })
  prescription(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string): Promise<PrescriptionPhotosResponse> {
    return this.prescriptions.photos(orderId, { customerId: profileId });
  }

  /** BRIEF D3f: what the customer owes from cancels after collection. */
  @Get("balance")
  balance(@CurrentUser() profileId: string): Promise<CustomerBalanceResponse> {
    return this.foodOrders.myBalance(profileId);
  }
}

/**
 * Order flow v2 (ledger D-59, backend B) — the merchant's and rider's new routes. A separate path for the
 * Scheduled list (`merchant/scheduled-orders`) so it can't be captured by `merchant/orders/:orderId`.
 */
@Controller("merchant")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard)
export class OrderFlowMerchantController {
  constructor(
    private readonly foodOrders: FoodOrderService,
    private readonly prescriptions: PrescriptionService,
  ) {}

  /** M7a: scheduled orders waiting for their ring time ("Rings at 12:05 like a new order" = `ringsAt`). */
  @Get("scheduled-orders")
  @UseGuards(MerchantGuard)
  scheduled(@CurrentUser() profileId: string): Promise<MerchantOrderResponse[]> {
    return this.foodOrders.listScheduled(profileId);
  }

  /** M8a: the prescription's pages for the pharmacist (signed read URLs). */
  @Get("orders/:orderId/prescription")
  @UseGuards(MerchantGuard)
  @Throttle({ limit: 30, windowSec: 60, keyPrefix: "rx-photos" })
  prescription(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string): Promise<PrescriptionPhotosResponse> {
    return this.prescriptions.photos(orderId, { merchantProfileId: profileId });
  }

  /** M8a "Approve prescription" — a team member with isPharmacist. */
  @Post("orders/:orderId/prescription/approve")
  @UseGuards(MerchantGuard)
  async approve(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string): Promise<MerchantOrderResponse> {
    await this.prescriptions.approve(profileId, orderId);
    return this.foodOrders.getQueueOrder(profileId, orderId);
  }

  /** M8b "Decline and tell the customer" — reason chip + optional note; the Rx lines come off. */
  @Post("orders/:orderId/prescription/decline")
  @UseGuards(MerchantGuard)
  async decline(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(DeclinePrescriptionRequest)) body: DeclinePrescriptionRequest,
    @CurrentUser() profileId: string,
  ): Promise<MerchantOrderResponse> {
    await this.prescriptions.decline(profileId, orderId, body);
    return this.foodOrders.getQueueOrder(profileId, orderId);
  }

  /** RD3: the assigned RIDER's "I saw the original prescription" tick (no MerchantGuard — party-checked). */
  @Post("orders/:orderId/prescription/saw-original")
  sawOriginal(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.prescriptions.riderSawOriginal(orderId, profileId);
  }
}

function parsePoint(lat?: string, lng?: string): { lat: number; lng: number } | null {
  if (lat === undefined && lng === undefined) return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
    throw new BadRequestException("lat/lng must be numbers");
  }
  return { lat: la, lng: ln };
}
