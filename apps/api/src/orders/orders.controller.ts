import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
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

  @Get(":orderId")
  get(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() callerId: string) {
    return this.orders.getSnapshot(orderId, callerId);
  }
}
