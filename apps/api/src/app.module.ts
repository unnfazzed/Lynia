import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { PushModule } from "./adapters/push/push.module";
import { SecretsModule } from "./adapters/secrets/secrets.module";
import { StorageModule } from "./adapters/storage/storage.module";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { MatchingModule } from "./matching/matching.module";
import { OffersModule } from "./offers/offers.module";
import { OrdersModule } from "./orders/orders.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TrackingModule } from "./tracking/tracking.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    // Cloud-portable adapter seam (D7): swap impls via CLOUD_PROVIDER, no business-logic edits.
    StorageModule,
    SecretsModule,
    PushModule,
    HealthModule,
    // Lane B — auth (OTP + JWT/refresh sessions).
    AuthModule,
    // Lane C — the offer loop.
    MatchingModule,
    OrdersModule,
    OffersModule,
    // Lane D — live tracking (Socket.IO gateway + nearby-rider geo).
    TrackingModule,
  ],
})
export class AppModule {}
