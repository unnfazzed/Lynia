import { Module } from "@nestjs/common";
import { MatchingModule } from "../matching/matching.module";
import { OrdersModule } from "../orders/orders.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  // E6: MatchingModule/OrdersModule export the BullMQ queue owners (OfferExpiryService,
  // OrderLifecycleService) whose pingQueue() feeds `queues` in /healthz. Acyclic: neither imports health.
  imports: [MatchingModule, OrdersModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
