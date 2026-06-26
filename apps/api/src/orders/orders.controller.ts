import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { CreateOrderRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(
    @Body(new ZodBody(CreateOrderRequest)) body: CreateOrderRequest,
    @CurrentUser() customerId: string,
  ) {
    return this.orders.create(body, customerId);
  }

  // Authenticated: the snapshot reveals the counterparty phone in-window, scoped to the caller (§5d).
  @Get(":orderId")
  @UseGuards(JwtAuthGuard)
  get(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() callerId: string) {
    return this.orders.getSnapshot(orderId, callerId);
  }
}
