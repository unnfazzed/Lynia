import { Module } from "@nestjs/common";
import { SettlementsModule } from "../settlements/settlements.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  // SettlementsModule exports SettlementsService — the admin cash endpoints delegate to it (A-06).
  imports: [SettlementsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
