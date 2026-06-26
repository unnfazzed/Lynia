import { Controller, Get } from "@nestjs/common";
import { HealthService, type HealthReport } from "./health.service";

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("healthz")
  async healthz(): Promise<HealthReport> {
    return this.health.check();
  }
}
