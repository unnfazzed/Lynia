import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminAuditReadService, AUDIT_ACTION_LABELS, actionFamily, auditActionLabel } from "./admin-audit-read.service";
import { RESERVED_AUDIT_ACTIONS } from "./admin-audit.service";
import { decodeCursor, encodeCursor } from "./admin-read.shared";

const RIDER = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";
const ORDER = "33333333-3333-4333-8333-333333333333";
const MERCHANT = "44444444-4444-4444-8444-444444444444";
const ADMIN = "55555555-5555-4555-8555-555555555555";

function row(over: Record<string, unknown>) {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    actor: "ops@lyniago.com",
    action: "order.cancel",
    target: ORDER,
    targetType: null,
    reasonCode: "customer_request",
    note: null,
    amount: null,
    balanceAfter: null,
    before: null,
    after: null,
    createdAt: new Date("2026-10-13T08:00:00Z"),
    ...over,
  };
}

function prismaWith(rows: ReturnType<typeof row>[]) {
  const calls: { where?: unknown; take?: number }[] = [];
  const prisma = {
    auditLog: {
      findMany: async (args: { where?: unknown; take?: number }) => {
        calls.push(args);
        return rows;
      },
    },
    profile: {
      findMany: async () => [
        { id: RIDER, firstName: "Tendai", lastName: "Moyo", role: "rider", rider: { profileId: RIDER } },
        { id: CUSTOMER, firstName: "Rudo", lastName: "Dube", role: "customer", rider: null },
        { id: ADMIN, firstName: "Ops", lastName: "Admin", role: "admin", rider: null },
      ],
    },
    order: { findMany: async () => [{ id: ORDER }] },
    merchant: { findMany: async () => [{ id: MERCHANT, name: "Chicken Inn" }] },
    issue: { findMany: async () => [] },
    sosEvent: { findMany: async () => [] },
    topUp: { findMany: async () => [] },
  };
  return { prisma: prisma as unknown as PrismaService, calls };
}

describe("AdminAuditReadService (console v2 §8)", () => {
  it("labels every reserved action and maps families to target types", () => {
    for (const a of RESERVED_AUDIT_ACTIONS) expect(AUDIT_ACTION_LABELS[a], a).toBeTruthy();
    expect(actionFamily("wallet.credit")).toBe("rider");
    expect(actionFamily("customer.hold")).toBe("customer");
    expect(actionFamily("something.else")).toBeNull();
    expect(auditActionLabel("order.something_new")).toBe("Order something new");
    // Copy says biker, never rider (D-101).
    for (const label of Object.values(AUDIT_ACTION_LABELS)) expect(label).not.toMatch(/rider/i);
  });

  it("builds the filter: target, family-aware type, actor, action family, Harare days and the cursor", () => {
    const svc = new AdminAuditReadService({} as PrismaService);
    const cursor = { at: new Date("2026-10-13T09:00:00Z"), key: "aaaaaaaa-0000-4000-8000-000000000009" };
    const where = svc.buildWhere(
      { target: RIDER, targetType: "rider", actor: "ops@lyniago.com", action: "rider.", from: "2026-10-01", to: "2026-10-13" },
      cursor,
    );
    expect(where).toEqual({
      AND: [
        { target: RIDER },
        {
          OR: [
            { targetType: "rider" },
            { targetType: null, OR: [{ action: { startsWith: "rider." } }, { action: { startsWith: "wallet." } }] },
          ],
        },
        { actor: "ops@lyniago.com" },
        { action: { startsWith: "rider." } },
        { createdAt: { gte: new Date("2026-09-30T22:00:00Z") } },
        { createdAt: { lt: new Date("2026-10-13T22:00:00Z") } },
        { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.key } }] },
      ],
    });
    expect(svc.buildWhere({ action: "rider.ban", targetType: "bogus" }, null)).toEqual({ AND: [{ action: "rider.ban" }] });
    expect(svc.buildWhere({}, null)).toEqual({});
  });

  it("resolves actors and targets for display and pages with a cursor", async () => {
    const rows = [
      row({ id: "aaaaaaaa-0000-4000-8000-000000000003", action: "rider.suspend", target: RIDER, actor: ADMIN, createdAt: new Date("2026-10-13T10:00:00Z") }),
      // A biker's customer side opens the customer page.
      row({ id: "aaaaaaaa-0000-4000-8000-000000000002", action: "customer.hold", target: RIDER, actor: "system:kyc-webhook", createdAt: new Date("2026-10-13T09:00:00Z") }),
      row({ id: "aaaaaaaa-0000-4000-8000-000000000001", action: "merchant.go_live", target: MERCHANT, targetType: "merchant", amount: { toString: () => "5.00" } }),
    ];
    const { prisma, calls } = prismaWith(rows);
    const svc = new AdminAuditReadService(prisma);
    const res = await svc.list({ limit: "2" });
    expect(calls[0]!.take).toBe(3);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({
      actionLabel: "Suspended",
      actor: { name: "Ops Admin", href: null },
      target: { type: "rider", label: "Tendai Moyo", href: `/riders/${RIDER}` },
    });
    expect(res.rows[1]).toMatchObject({
      actor: { name: "System · kyc-webhook" },
      target: { type: "customer", label: "Tendai Moyo", href: `/customers/${RIDER}` },
    });
    expect(decodeCursor(res.nextCursor)).toEqual({ at: new Date("2026-10-13T09:00:00Z"), key: "aaaaaaaa-0000-4000-8000-000000000002" });
  });

  it("labels an order by short id and a non-id target as typed; ends with no cursor", async () => {
    const { prisma } = prismaWith([row({}), row({ id: "aaaaaaaa-0000-4000-8000-000000000000", action: "order.nudge_rider", target: "Tendai M" })]);
    const res = await new AdminAuditReadService(prisma).list({ cursor: encodeCursor({ at: new Date(), key: "not-a-uuid" }) });
    expect(res.rows[0]!.target).toEqual({ type: "order", id: ORDER, label: "#333333", href: `/orders/${ORDER}` });
    expect(res.rows[0]!.actor).toEqual({ id: "ops@lyniago.com", name: "ops@lyniago.com", href: null });
    expect(res.rows[1]!.target).toEqual({ type: "order", id: "Tendai M", label: "Tendai M", href: null });
    expect(res.nextCursor).toBeNull();
  });
});
