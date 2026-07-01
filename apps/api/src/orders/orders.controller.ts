import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { CreateOrderRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { OrdersService } from "./orders.service";

// Guarded at the class level: create attributes the order to the caller, and the snapshot reveals
// the counterparty phone in-window (§5d) — both must be the authenticated user, not a spoofable header.
@Controller("orders")
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(
    @Body(new ZodBody(CreateOrderRequest)) body: CreateOrderRequest,
    @CurrentUser() customerId: string,
  ) {
    return this.orders.create(body, customerId);
  }

  // Static routes MUST precede the :orderId param route, or "open"/"mine" get parsed as an order id.

  /**
   * Open orders a rider can bid on. Optional `lat`/`lng` (with an optional `radiusM`) scope the board
   * to the rider's neighbourhood, distance-sorted; without them it falls back to the city-wide list.
   * Params are coerced to numbers and only passed through when both lat & lng are finite.
   */
  @Get("open")
  open(
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
    @Query("radiusM") radiusM?: string,
  ) {
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
