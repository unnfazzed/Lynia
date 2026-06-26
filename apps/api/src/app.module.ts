import { Module } from "@nestjs/common";
import { PushModule } from "./adapters/push/push.module";
import { SecretsModule } from "./adapters/secrets/secrets.module";
import { StorageModule } from "./adapters/storage/storage.module";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    // Cloud-portable adapter seam (D7): swap impls via CLOUD_PROVIDER, no business-logic edits.
    StorageModule,
    SecretsModule,
    PushModule,
    HealthModule,
    // Lanes B/C/D add: AuthModule, OrdersModule, OffersModule, MatchingModule, TrackingModule.
  ],
})
export class AppModule {}
