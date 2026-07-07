import { Injectable, NotFoundException } from "@nestjs/common";
import { maskPhone } from "../common/phone-mask";
import { PrismaService } from "../prisma/prisma.service";
import { auditData, fmtDate, reportsFor, round, toTripRow } from "./admin.shared";

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Customers directory. A customer is a Profile with role `customer`. Aggregates real data the schema
   * supports: order count, spend (sum of agreedFare on completed orders), cancel ratio, joined date;
   * phone is masked (A-03 — a bulk directory is never a reveal context).
   *
   * `filter` narrows by derived status. Since there is no ban/flag state on Profile yet every
   * customer is `active`, so `?filter=flagged` legitimately returns none (TODO(A-05): the
   * flagged/banned states need schema on Profile). `flags` is the customer's real Report count.
   */
  async listCustomers(filter?: "active" | "flagged" | "banned" | "on_hold") {
    const profiles = await this.prisma.profile.findMany({
      where: { role: "customer" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, firstName: true, lastName: true, phone: true, createdAt: true, onHold: true, holdReason: true },
    });
    const ids = profiles.map((p) => p.id);

    const [totals, cancelled, spend, flagged] = await Promise.all([
      this.prisma.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids } }, _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ["customerId"],
        where: { customerId: { in: ids }, status: "cancelled" },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ["customerId"],
        where: { customerId: { in: ids }, status: "completed" },
        _sum: { agreedFare: true },
      }),
      // Real flag counts (A-05): how many times riders have reported each customer — same Report rows
      // the detail view lists, batched for the directory.
      this.prisma.report.groupBy({
        by: ["subjectProfileId"],
        where: { subjectProfileId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const totalBy = new Map(totals.map((r) => [r.customerId, r._count._all]));
    const cancelledBy = new Map(cancelled.map((r) => [r.customerId, r._count._all]));
    const spendBy = new Map(spend.map((r) => [r.customerId, r._sum.agreedFare]));
    const flagsBy = new Map(flagged.map((r) => [r.subjectProfileId, r._count._all]));

    const rows = profiles.map((p) =>
      this.toCustomer(p, totalBy.get(p.id) ?? 0, cancelledBy.get(p.id) ?? 0, spendBy.get(p.id) ?? null, flagsBy.get(p.id) ?? 0),
    );
    // `on_hold` is a real state now; `flagged`/`banned` still have no backing model, so those filters
    // legitimately return none. `active` (and no filter) returns everyone.
    return filter && filter !== "active" ? rows.filter((c) => (c.status as string) === filter) : rows;
  }

  /**
   * Single customer detail. All the directory fields for one customer plus the recent-orders trail and
   * the flag log — the customer's `Report` rows (times a rider reported them), with `flags` carrying
   * the same count the directory shows. Returns null when the id isn't a customer profile.
   */
  async getCustomerDetail(id: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { id, role: "customer" },
      select: { id: true, firstName: true, lastName: true, phone: true, createdAt: true, onHold: true, holdReason: true },
    });
    if (!profile) return null;

    const [total, cancelled, spend, recent, reports] = await Promise.all([
      this.prisma.order.count({ where: { customerId: id } }),
      this.prisma.order.count({ where: { customerId: id, status: "cancelled" } }),
      this.prisma.order.aggregate({ where: { customerId: id, status: "completed" }, _sum: { agreedFare: true } }),
      this.prisma.order.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          proposedFare: true,
          agreedFare: true,
          pickup: true,
          dropoff: true,
          createdAt: true,
        },
      }),
      reportsFor(this.prisma, id),
    ]);

    const base = this.toCustomer(profile, total, cancelled, spend._sum.agreedFare, reports.count);
    return {
      ...base,
      publicName: profile.firstName, // what riders see — first name only (§5d contact minimization)
      warn: undefined,
      flagLog: reports.recent,
      trail: recent.map((o) => toTripRow(o)),
    };
  }

  /** Shared Customer projection for the directory + detail — aggregates in, masked row out. */
  private toCustomer(
    p: { id: string; firstName: string; lastName: string; phone: string; createdAt: Date; onHold?: boolean; holdReason?: string | null },
    total: number,
    cancelled: number,
    spend: { toFixed: (n: number) => string } | null,
    flags: number,
  ) {
    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      phoneMasked: maskPhone(p.phone), // A-03: directory is never a reveal context
      orders: total,
      spend: spend ? spend.toFixed(2) : "0.00",
      cancelRatePct: total ? round((cancelled / total) * 100) : 0,
      flags, // the customer's Report count (how many times riders reported them)
      joined: fmtDate(p.createdAt),
      // S·2: real standing now — `on_hold` blocks the customer from broadcasting (OrdersService.create).
      status: p.onHold ? ("on_hold" as const) : ("active" as const),
      holdReason: p.holdReason ?? null,
    };
  }

  /**
   * S·2: place a customer on hold (blocks new broadcasts) + write the audit row in ONE transaction.
   * Mirrors the rider suspend/lift pattern. Reason required (enforced by the controller's zod body).
   * 404s when the id isn't a customer profile.
   */
  async holdCustomer(actor: string, profileId: string, input: { reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.profile.findFirst({ where: { id: profileId, role: "customer" }, select: { id: true } });
      if (!customer) throw new NotFoundException("Customer not found");
      await tx.profile.update({ where: { id: profileId }, data: { onHold: true, holdReason: input.reason } });
      const audit = await tx.auditLog.create({
        data: auditData(actor, "customer.hold", profileId, input.reason, input.note),
        select: { id: true },
      });
      return { id: profileId, status: "on_hold" as const, auditId: audit.id };
    });
  }

  /** S·2: lift a customer hold → back to active, clearing the reason. Reason optional. Mutation + audit
   *  in one transaction. 404s when the id isn't a customer. */
  async liftCustomerHold(actor: string, profileId: string, input: { reason?: string | null; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.profile.findFirst({ where: { id: profileId, role: "customer" }, select: { id: true } });
      if (!customer) throw new NotFoundException("Customer not found");
      await tx.profile.update({ where: { id: profileId }, data: { onHold: false, holdReason: null } });
      const audit = await tx.auditLog.create({
        data: auditData(actor, "customer.lift", profileId, input.reason, input.note),
        select: { id: true },
      });
      return { id: profileId, status: "active" as const, auditId: audit.id };
    });
  }
}
