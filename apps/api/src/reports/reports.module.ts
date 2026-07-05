import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

/**
 * Report-a-user + block. PrismaService is global, so no imports are needed. The block-pair predicate
 * used by matching lives in `./blocks` as a pure helper (imported directly, not via DI).
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
