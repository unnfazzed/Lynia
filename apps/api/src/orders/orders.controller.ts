import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { AcceptDisclaimerRequest, CreateOrderRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { TrackingService } from "../tracking/tracking.service";
import { OrdersService } from "./orders.service";

// Guarded at the class level: create attributes the order to the caller, and the snapshot reveals
// the counterparty phone in-window (§5d) — both must be the authenticated user, not a spoofable header.
@Controller("orders")
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly tracking: TrackingService,
  ) {}

  // Cap order creation per caller/IP — an authenticated user shouldn't be able to flood the offer
  // board (each order fans out a push to nearby riders, so this is also a spam/cost control).
  @Post()
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "order-create" })
  create(
    @Body(new ZodBody(CreateOrderRequest)) body: CreateOrderRequest,
    @CurrentUser() customerId: string,
  ) {
    return this.orders.create(body, customerId);
  }

  /** Acknowledge the customer's pre-broadcast disclaimer consent (A1-8). The binding record is the
   *  order's own `disclaimerVersion`/`disclaimerAcceptedAt` stamped at create; this endpoint lets the
   *  client register acceptance at the gate (before it has an order id) and get the server timestamp. */
  @Post("disclaimer")
  acceptDisclaimer(
    @Body(new ZodBody(AcceptDisclaimerRequest)) body: AcceptDisclaimerRequest,
    @CurrentUser() customerId: string,
  ) {
    return this.orders.acceptDisclaimer(body.policyVersion, customerId);
  }

  // Static routes MUST precede the :orderId param route, or "open"/"mine" get parsed as an order id.

  /**
   * Open orders a rider can bid on. Optional `lat`/`lng` (with an optional `radiusM`) scope the board
   * to the rider's neighbourhood, distance-sorted; without them it falls back to the city-wide list.
   * Params are coerced to numbers and only passed through when both lat & lng are finite.
   *
   * Board-eligible riders only — otherwise any authenticated customer could enumerate every open
   * order's pickup/drop-off waypoints, landmarks and fares city-wide, or sweep `lat`/`lng` across the
   * corridor. Mirrors the `/riders/nearby` gate; contactPhone is already redacted server-side.
   */
  @Get("open")
  async open(
    @CurrentUser() callerId: string,
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
    @Query("radiusM") radiusM?: string,
  ) {
    if (!(await this.tracking.isBoardEligible(callerId))) throw new ForbiddenException("Riders only");
    const latN = Number(lat);
    const lngN = Number(lng);
    if (Number.isFinite(latN) && Number.isFinite(lngN)) {
      const radiusN = Number(radiusM);
      return this.orders.listOpen(latN, lngN, Number.isFinite(radiusN) ? radiusN : undefined);
    }
    return this.orders.listOpen();
  }

  /** The caller's current active job as a rider (or null). */
  @Get("mine/active")
  activeJob(@CurrentUser() riderId: string) {
    return this.orders.activeForRider(riderId);
  }

  /** The caller's order history across both roles (newest first). */
  @Get("history")
  history(@CurrentUser() userId: string) {
    return this.orders.historyForUser(userId);
  }

  @Get(":orderId")
  get(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() callerId: string) {
    return this.orders.getSnapshot(orderId, callerId);
  }
}
