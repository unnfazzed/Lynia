import { Module } from "@nestjs/common";
import { MatchingModule } from "../matching/matching.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [MatchingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
