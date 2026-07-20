import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrdersModule } from "../orders/orders.module";
import { AppBootstrapController } from "./app-bootstrap.controller";

/** Wave-2 W1: the one-round-trip cold-start aggregate. Pure composition — it owns no services of
 *  its own, importing AuthService (AuthModule) and OrdersService (OrdersModule). Acyclic: neither
 *  module imports this one. */
@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [AppBootstrapController],
})
export class AppBootstrapModule {}
