import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { PushModule } from "./adapters/push/push.module";
import { SecretsModule } from "./adapters/secrets/secrets.module";
import { StorageModule } from "./adapters/storage/storage.module";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { MatchingModule } from "./matching/matching.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ClientMetricsModule } from "./observability/client-metrics.module";
import { MetricsInterceptor } from "./observability/metrics.interceptor";
import { ObservabilityModule } from "./observability/metrics.service";
import { OffersModule } from "./offers/offers.module";
import { OrdersModule } from "./orders/orders.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RidersModule } from "./riders/riders.module";
import { TrackingModule } from "./tracking/tracking.module";
import { UploadsModule } from "./uploads/uploads.module";

@Module({
  imports: [
    ConfigModule,
    // Latency/SLO metrics (@Global) — MetricsService is injectable app-wide with no per-module import.
    ObservabilityModule,
    // Client RUM ingest (POST /client-metrics) — consumes the @Global MetricsService.
    ClientMetricsModule,
    PrismaModule,
    // Cloud-portable adapter seam (D7): swap impls via CLOUD_PROVIDER, no business-logic edits.
    StorageModule,
    SecretsModule,
    PushModule,
    // Push notifications + device-token registry (consumes the PUSH seam).
    NotificationsModule,
    HealthModule,
    // Lane B — auth (OTP + JWT/refresh sessions).
    AuthModule,
    // Lane C — the offer loop.
    MatchingModule,
    OrdersModule,
    OffersModule,
    // Lane D — live tracking (Socket.IO gateway + nearby-rider geo).
    TrackingModule,
    // Lane E — KYC + rider onboarding.
    RidersModule,
    // Client-direct media uploads (signed URLs) — rider KYC/profile photo.
    UploadsModule,
    // Lane F — admin read API for the monitor dashboard.
    AdminModule,
  ],
  providers: [
    // Time every HTTP request into http_request_duration_ms (route template + status class labels).
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
