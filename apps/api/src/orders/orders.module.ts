import { Module } from "@nestjs/common";
import { MatchingModule } from "../matching/matching.module";
import { TrackingModule } from "../tracking/tracking.module";
import { LifecycleController } from "./lifecycle.controller";
import { OrderLifecycleService } from "./order-lifecycle.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [MatchingModule, TrackingModule],
  controllers: [OrdersController, LifecycleController],
  providers: [OrdersService, OrderLifecycleService],
})
export class OrdersModule {}
