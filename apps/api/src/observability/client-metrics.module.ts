import { Module } from "@nestjs/common";
import { ClientMetricsController } from "./client-metrics.controller";

/**
 * Client RUM ingest (POST /client-metrics). Controller-only: MetricsService injects from the @Global
 * ObservabilityModule and JwtAuthGuard from the @Global AuthModule, so this needs no provider wiring —
 * mirrors how notifications keeps its controller in a thin module of its own.
 */
@Module({
  controllers: [ClientMetricsController],
})
export class ClientMetricsModule {}
