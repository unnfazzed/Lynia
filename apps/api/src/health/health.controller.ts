import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { HealthService, type HealthReport } from "./health.service";

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("healthz")
  async healthz(): Promise<HealthReport> {
    const report = await this.health.check();
    // If the DB is unreachable this instance can't serve any real request, so answer 503 (carrying the
    // same report body) — a load-balancer/k8s probe that keys on the HTTP status then pulls the node
    // from rotation instead of routing traffic that will 500. A degraded Redis alone still serves via
    // the PG fallbacks, so that stays 200 (a Redis blip shouldn't 503 every instance at once).
    if (!report.db) throw new ServiceUnavailableException(report);
    return report;
  }
}
