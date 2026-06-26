import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CreateOrderRequest } from "@lynia/shared";
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

  @Get(":orderId")
  get(@Param("orderId", ParseUUIDPipe) orderId: string) {
    return this.orders.getSnapshot(orderId);
  }
}
