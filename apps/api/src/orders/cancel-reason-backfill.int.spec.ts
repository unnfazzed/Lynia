/**
 * U33 review (migration 0087): runs the migration's own SQL against a real Postgres. Pre-change ops cancels
 * (an `order.cancel` audit row) and N-18 no-answer cancels stored the venue's `other`; they are moved to
 * LyniaGo's reasons so their history doesn't flip to "{venue} couldn't take your order". A venue's own
 * `other` (with a cancel note), a wallet refund and a customer decline are left alone; a re-run changes
 * nothing. Runs in CI (needs DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";

const prisma = new PrismaService();
const STATEMENTS = readFileSync(resolve(__dirname, "../../prisma/migrations/0087_cancel_reason_backfill/migration.sql"), "utf8")
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);
async function migrate(): Promise<number> {
  let n = 0;
  for (const s of STATEMENTS) n += await prisma.$executeRawUnsafe(s);
  return n;
}

let customerId = "";
async function order(data: Record<string, unknown>): Promise<string> {
  const o = await prisma.order.create({
    data: {
      customerId,
      orderType: "merchant",
      pickup: { landmark: "A" } as never,
      dropoff: { landmark: "B" } as never,
      itemDesc: "Food",
      suggestedFare: 2,
      proposedFare: 2,
      status: "cancelled",
      rejectionReason: "other",
      ...data,
    } as never,
    select: { id: true },
  });
  return o.id;
}
const reasonOf = async (id: string): Promise<string | null> => (await prisma.order.findUniqueOrThrow({ where: { id }, select: { rejectionReason: true } })).rejectionReason;

// The int specs share one database (run in sequence): leave nothing behind for the next file.
async function clean(): Promise<void> {
  await prisma.auditLog.deleteMany({});
  await prisma.orderEvent.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.profile.deleteMany({});
}
beforeEach(async () => {
  await clean();
  customerId = (await prisma.profile.create({ data: { role: "customer", firstName: "C", lastName: "C", phone: `c_${crypto.randomUUID()}` }, select: { id: true } })).id;
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("0087_cancel_reason_backfill (real Postgres)", () => {
  it("moves pre-change ops and N-18 cancels off the venue's `other`, and only those; idempotent", async () => {
    const deadline = new Date(Date.now() - 60 * 60_000);
    const ops = await order({ cancelledAt: new Date() });
    await prisma.auditLog.create({ data: { actor: "admin-1", action: "order.cancel", target: ops, reasonCode: "restaurant can't make it" } });
    const n18 = await order({ itemApprovalDeadlineAt: deadline, cancelledAt: new Date(deadline.getTime() + 30_000) });
    const venue = await order({ cancelledAt: new Date(), cancelReason: "Gas ran out" });
    const refund = await order({ cancelledAt: new Date(), refundReference: "EC123" });
    const declinedByCustomer = await order({ itemApprovalDeadlineAt: deadline, cancelledAt: new Date(deadline.getTime() - 10_000), cancelledBy: customerId, rejectionReason: null });
    const venueBeforeDeadline = await order({ itemApprovalDeadlineAt: deadline, cancelledAt: new Date(deadline.getTime() - 10_000) });
    await migrate();
    expect(await reasonOf(ops)).toBe("lynia_cancelled");
    expect(await reasonOf(n18)).toBe("item_approval_expired");
    expect(await reasonOf(venue)).toBe("other");
    expect(await reasonOf(refund)).toBe("other");
    expect(await reasonOf(declinedByCustomer)).toBeNull();
    expect(await reasonOf(venueBeforeDeadline)).toBe("other");
    expect(await migrate()).toBe(0);
  });
});
