import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Prisma connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lightweight liveness check for /healthz. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      this.logger.error("Prisma ping failed", err as Error);
      return false;
    }
  }
}
