import { Module } from "@nestjs/common";
import { SosController } from "./sos.controller";
import { SosService } from "./sos.service";

/**
 * SOS on a live trip (R-16/F-13). PrismaService + NotificationsService are global, so no imports are
 * needed.
 */
@Module({
  controllers: [SosController],
  providers: [SosService],
  exports: [SosService],
})
export class SosModule {}
