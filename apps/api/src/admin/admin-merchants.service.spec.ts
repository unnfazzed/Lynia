import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminMerchantsService } from "./admin-merchants.service";

/** Decimal-like stub — Prisma returns Decimal objects whose `.toString()` we serialize. */
const dec = (s: string) => ({ toString: () => s });

describe("AdminMerchantsService.listMerchants + getMerchantDetail (X1)", () => {
  const merchant = {
    id: "m1",
    name: "Mama's Kitchen",
    cashRule: "collect_and_return",
    pilotEnabled: true,
    busyMode: false,
    cuisineTags: ["Zimbabwean"],
    createdAt: new Date("2026-07-01T00:00:00Z"),
  };

  it("aggregates order count + open-debt total per merchant", async () => {
    const prisma = {
      merchant: { findMany: async () => [merchant] },
      order: {
        groupBy: async (args: { where: { debtStatus?: string } }) =>
          args.where.debtStatus === "open"
            ? [{ merchantId: "m1", _sum: { debtAmount: dec("8.00") }, _count: { _all: 1 } }]
            : [{ merchantId: "m1", _count: { _all: 12 } }],
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const rows = await svc.listMerchants();
    expect(rows[0]).toMatchObject({
      id: "m1",
      name: "Mama's Kitchen",
      cashRule: "collect_and_return",
      pilotEnabled: true,
      orders: 12,
      openDebtAmount: "8.00",
      openDebtCount: 1,
      joined: "2026-07-01",
    });
  });

  it("a merchant with no open debt reports $0.00 / 0, not undefined", async () => {
    const prisma = {
      merchant: { findMany: async () => [merchant] },
      order: { groupBy: async () => [] },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const rows = await svc.listMerchants();
    expect(rows[0]).toMatchObject({ openDebtAmount: "0.00", openDebtCount: 0 });
  });

  it("detail returns null when the id isn't a merchant", async () => {
    const svc = new AdminMerchantsService({ merchant: { findUnique: async () => null } } as unknown as PrismaService);
    expect(await svc.getMerchantDetail("nope")).toBeNull();
  });

  it("detail includes the recent-orders trail and the full debt-ledger trail", async () => {
    const prisma = {
      merchant: { findUnique: async () => merchant },
      // L2: the business's booking account (none yet).
      profile: { findUnique: async () => null },
      order: {
        count: async () => 12,
        aggregate: async () => ({ _sum: { debtAmount: dec("8.00") }, _count: { _all: 1 } }),
        findMany: async () => [
          {
            id: "o1",
            status: "completed",
            proposedFare: dec("9.50"),
            agreedFare: dec("9.50"),
            pickup: { landmark: "Mama's Kitchen" },
            dropoff: { landmark: "Borrowdale" },
            createdAt: new Date("2026-07-30T00:00:00Z"),
          },
        ],
      },
      merchantDebtLedger: {
        findMany: async () => [
          { id: "l1", orderId: "o2", riderId: "r1", type: "opened", amount: dec("8.00"), note: null, actor: "system", createdAt: new Date("2026-07-29T00:00:00Z") },
          { id: "l2", orderId: "o2", riderId: "r1", type: "written_off", amount: dec("-8.00"), note: "non-return", actor: "m1", createdAt: new Date("2026-07-30T00:00:00Z") },
        ],
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const d = (await svc.getMerchantDetail("m1"))!;
    expect(d.trail[0]).toMatchObject({ id: "o1", route: "Mama's Kitchen → Borrowdale", fare: "9.50" });
    expect(d.debtLedger).toEqual([
      { id: "l1", orderId: "o2", riderId: "r1", type: "opened", amount: "8.00", note: null, actor: "system", at: "2026-07-29T00:00:00.000Z" },
      { id: "l2", orderId: "o2", riderId: "r1", type: "written_off", amount: "-8.00", note: "non-return", actor: "m1", at: "2026-07-30T00:00:00.000Z" },
    ]);
    expect(d.debtLedgerNextCursor).toBeNull();
    expect(d.bookingAccount).toBeNull();
  });

  it("L2 (R2-5): the detail links the business's booking account, where ops holds a whole business's bookings", async () => {
    let asked: unknown;
    const prisma = {
      merchant: { findUnique: async () => merchant },
      profile: {
        findUnique: async (args: { where: { phone: string } }) => {
          asked = args.where.phone;
          return { id: "acct-1", onHold: true };
        },
      },
      order: {
        count: async () => 0,
        aggregate: async () => ({ _sum: { debtAmount: null }, _count: { _all: 0 } }),
        findMany: async () => [],
      },
      merchantDebtLedger: { findMany: async () => [] },
    };
    const d = (await new AdminMerchantsService(prisma as unknown as PrismaService).getMerchantDetail("m1"))!;
    expect(asked).toBe("business:m1");
    expect(d.bookingAccount).toEqual({ id: "acct-1", onHold: true });
  });

  /** One debt-ledger row builder, newest-first ids (l1 = newest). */
  function debtRow(id: string, at: string) {
    return {
      id,
      orderId: "o2",
      riderId: "r1",
      type: "opened" as const,
      amount: dec("8.00"),
      note: null,
      actor: "system",
      createdAt: new Date(at),
    };
  }

  // LC-D-T1: the debt ledger used to hard-cap at `take: 30` with no `nextCursor` and no way to page
  // back — the same shape D-D0f/LC-D07 fixed for the rider wallet ledger, just missed here. Mirrors
  // AdminRidersService.walletView's cursor tests exactly.
  it("LC-D-T1: a merchant with more than 30 debt-ledger entries gets a nextCursor instead of silently truncating", async () => {
    const rows = Array.from({ length: 31 }, (_, i) =>
      debtRow(`l${i + 1}`, new Date(new Date("2026-07-30T00:00:00Z").getTime() - i * 86_400_000).toISOString()),
    );
    const prisma = {
      merchant: { findUnique: async () => merchant },
      // L2: the business's booking account (none yet).
      profile: { findUnique: async () => null },
      order: {
        count: async () => 12,
        aggregate: async () => ({ _sum: { debtAmount: dec("8.00") }, _count: { _all: 1 } }),
        findMany: async () => [],
      },
      merchantDebtLedger: { findMany: async () => rows },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const d = (await svc.getMerchantDetail("m1"))!;
    // Only the first 30 of the 31 fetched rows are returned — the 31st was fetched purely to detect
    // hasMore and must not leak into the page.
    expect(d.debtLedger).toHaveLength(30);
    expect(d.debtLedger[29]!.id).toBe("l30");
    expect(d.debtLedgerNextCursor).toBe("l30");
  });

  it("LC-D-T1: debtCursor pages past the first 30 entries instead of always returning the newest page", async () => {
    const prisma = {
      merchant: { findUnique: async () => merchant },
      // L2: the business's booking account (none yet).
      profile: { findUnique: async () => null },
      order: {
        count: async () => 12,
        aggregate: async () => ({ _sum: { debtAmount: dec("8.00") }, _count: { _all: 1 } }),
        findMany: async () => [],
      },
      merchantDebtLedger: {
        findMany: async (args: { orderBy: unknown; take: number; cursor?: { id: string }; skip?: number }) => {
          expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
          expect(args.take).toBe(31);
          expect(args.cursor).toEqual({ id: "l30" });
          expect(args.skip).toBe(1);
          return [debtRow("l31", "2026-06-30T00:00:00Z")];
        },
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const d = (await svc.getMerchantDetail("m1", "l30"))!;
    expect(d.debtLedger).toHaveLength(1);
    expect(d.debtLedger[0]!.id).toBe("l31");
    expect(d.debtLedgerNextCursor).toBeNull();
  });
});

describe("AdminMerchantsService.listDisputes (X1 — R-05 handshake freezes + N-12 refund overdue)", () => {
  it("surfaces a frozen handshake with merchant/customer/rider names", async () => {
    const prisma = {
      order: {
        findMany: async (args: { where: { cashHandshakeFrozenAt?: unknown } }) => {
          if ("cashHandshakeFrozenAt" in args.where) {
            return [
              {
                id: "o1",
                cashHandshakeFrozenAt: new Date("2026-07-30T11:02:01Z"),
                cashHandshakeAmount: dec("9.50"),
                customerCashConfirmedAt: new Date("2026-07-30T11:00:00Z"),
                merchant: { name: "Mama's Kitchen" },
                customer: { firstName: "Rudo", lastName: "K" },
                rider: { profile: { firstName: "Tendai", lastName: "M" } },
              },
            ];
          }
          return [];
        },
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const { handshakeDisputes, refundsOverdue } = await svc.listDisputes();
    expect(handshakeDisputes).toEqual([
      {
        orderId: "o1",
        merchant: "Mama's Kitchen",
        customer: "Rudo K",
        rider: "Tendai M",
        amount: "9.50",
        customerConfirmedAt: "2026-07-30T11:00:00.000Z",
        frozenAt: "2026-07-30T11:02:01.000Z",
      },
    ]);
    expect(refundsOverdue).toEqual([]);
  });

  it("N-12: marks a refund overdue past the 2h SLA, and NOT overdue just under it", async () => {
    const now = Date.now();
    const overdueAt = new Date(now - 3 * 60 * 60 * 1000); // 3h ago — past SLA
    const withinSlaAt = new Date(now - 30 * 60 * 1000); // 30m ago — within SLA
    const prisma = {
      order: {
        findMany: async (args: { where: { cashHandshakeFrozenAt?: unknown } }) => {
          if ("cashHandshakeFrozenAt" in args.where) return [];
          return [
            {
              id: "overdue-1",
              merchantGoodsTotal: dec("8.00"),
              cancelledAt: overdueAt,
              undeliveredAt: null,
              updatedAt: overdueAt,
              merchant: { name: "Mama's Kitchen" },
              customer: { firstName: "Rudo", lastName: "K" },
            },
            {
              id: "fresh-1",
              merchantGoodsTotal: dec("5.00"),
              cancelledAt: withinSlaAt,
              undeliveredAt: null,
              updatedAt: withinSlaAt,
              merchant: { name: "Mama's Kitchen" },
              customer: { firstName: "Rudo", lastName: "K" },
            },
          ];
        },
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const { refundsOverdue } = await svc.listDisputes();
    const overdue = refundsOverdue.find((r) => r.orderId === "overdue-1")!;
    const fresh = refundsOverdue.find((r) => r.orderId === "fresh-1")!;
    expect(overdue.overdue).toBe(true);
    expect(fresh.overdue).toBe(false);
  });
});

describe("AdminMerchantsService.resolveHandshake (X1/R-05 — the only lever out of a frozen handshake)", () => {
  interface Calls {
    update: { where: Record<string, unknown>; data: Record<string, unknown> } | null;
    audit: { data: Record<string, unknown> } | null;
  }
  function makeTx(
    order: unknown = {
      orderType: "merchant",
      cashHandshakeFrozenAt: new Date("2026-07-30T11:02:01Z"),
      riderCashConfirmedAt: null,
      customerId: "c1",
      riderId: "r1",
    },
    updateCount = 1,
  ) {
    const calls: Calls = { update: null, audit: null };
    const tx = {
      order: {
        findUnique: async () => order,
        updateMany: async (args: Calls["update"]) => { calls.update = args; return { count: updateCount }; },
      },
      auditLog: { create: async (args: Calls["audit"]) => { calls.audit = args; return { id: "audit-7" }; } },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { prisma, calls };
  }

  it("sets riderCashConfirmedAt (the SAME release valve the rider's own confirm uses) and audits atomically", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const res = await svc.resolveHandshake("admin-1", "o1", { reason: "Called both parties — amounts matched" });
    expect(calls.update!.data.riderCashConfirmedAt).toBeInstanceOf(Date);
    expect(calls.audit!.data).toMatchObject({
      actor: "admin-1",
      action: "order.handshake_resolve",
      target: "o1",
      reasonCode: "Called both parties — amounts matched",
    });
    expect(res).toEqual({ id: "o1", resolved: true, auditId: "audit-7" });
  });

  it("404s when the order isn't a merchant order", async () => {
    const { prisma } = makeTx({ orderType: "parcel" });
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await expect(svc.resolveHandshake("admin-1", "o1", { reason: "x" })).rejects.toThrow(/order not found/i);
  });

  it("409s when the handshake isn't actually frozen — nothing to resolve", async () => {
    const { prisma, calls } = makeTx({ orderType: "merchant", cashHandshakeFrozenAt: null, riderCashConfirmedAt: null, customerId: "c1", riderId: "r1" });
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await expect(svc.resolveHandshake("admin-1", "o1", { reason: "x" })).rejects.toThrow(/isn't frozen/i);
    expect(calls.audit).toBeNull();
  });

  it("409s when the dispute was already resolved (riderCashConfirmedAt already set) — no double-resolve", async () => {
    const { prisma, calls } = makeTx({
      orderType: "merchant",
      cashHandshakeFrozenAt: new Date(),
      riderCashConfirmedAt: new Date(),
      customerId: "c1",
      riderId: "r1",
    });
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await expect(svc.resolveHandshake("admin-1", "o1", { reason: "x" })).rejects.toThrow(/already resolved/i);
    expect(calls.audit).toBeNull();
  });

  it("CAS conflict (0 rows) → 409, no audit committed", async () => {
    const { prisma, calls } = makeTx(undefined, 0);
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await expect(svc.resolveHandshake("admin-1", "o1", { reason: "x" })).rejects.toThrow(/refresh and try again/i);
    expect(calls.audit).toBeNull();
  });

  it("pushes both the rider (jobs unlocked) and customer (code ready) a best-effort notice, post-commit", async () => {
    const { prisma } = makeTx();
    const notified: Array<{ profileIds: string[]; msg: { title: string } }> = [];
    const notifications = {
      notifyProfiles: async (profileIds: string[], msg: { title: string }) => { notified.push({ profileIds, msg }); },
    } as unknown as import("../notifications/notifications.service").NotificationsService;
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService, notifications);
    await svc.resolveHandshake("admin-1", "o1", { reason: "x" });
    expect(notified).toHaveLength(2);
    expect(notified.find((n) => n.profileIds[0] === "r1")!.msg).toMatchObject({ title: "Support resolved the payment dispute" });
    expect(notified.find((n) => n.profileIds[0] === "c1")!.msg).toMatchObject({ title: "Your delivery code is ready" });
  });
});

describe("AdminMerchantsService — merchant web upgrade L1 (go-live switch + ops queue)", () => {
  const PIN = { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Next to the rank", contactPhone: "+263771234567" };

  /** A fake Prisma for setPilot: `$transaction(cb)` runs against the same fake; writes are recorded. */
  function pilotHarness(merchant: Record<string, unknown> | null, liveDishes = 1) {
    const writes: { update?: unknown; audit?: Record<string, unknown> } = {};
    const prisma: Record<string, unknown> = {
      merchant: {
        findUnique: async () => merchant,
        update: async (args: unknown) => (writes.update = args),
      },
      merchantDish: { count: async () => liveDishes },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          writes.audit = data;
          return { id: "audit-1" };
        },
      },
    };
    prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
    return { svc: new AdminMerchantsService(prisma as unknown as PrismaService), writes };
  }

  it("switches a ready restaurant on, with the flip and its audit row in one transaction", async () => {
    const { svc, writes } = pilotHarness({ id: "m1", businessType: "restaurant", pilotEnabled: false, location: PIN });
    const res = await svc.setPilot("ops@lyniago", "m1", { enabled: true, note: "Called; pin checked on street view" });
    expect(res).toEqual({ id: "m1", pilotEnabled: true, auditId: "audit-1" });
    expect(writes.update).toEqual({ where: { id: "m1" }, data: { pilotEnabled: true } });
    expect(writes.audit).toMatchObject({ actor: "ops@lyniago", action: "merchant.go_live", target: "m1", note: "Called; pin checked on street view" });
  });

  it("refuses to switch a SHOP on — shops open with LyniaGo Shops (R-7)", async () => {
    const { svc, writes } = pilotHarness({ id: "m2", businessType: "shop", pilotEnabled: false, location: PIN });
    await expect(svc.setPilot("ops", "m2", { enabled: true })).rejects.toMatchObject({ status: 409, response: { reason: "shops_not_open" } });
    expect(writes.update).toBeUndefined();
    expect(writes.audit).toBeUndefined();
  });

  it("refuses a restaurant with no pickup pin, or with no live (photo'd) dish", async () => {
    const noPin = pilotHarness({ id: "m1", businessType: "restaurant", pilotEnabled: false, location: null });
    await expect(noPin.svc.setPilot("ops", "m1", { enabled: true })).rejects.toMatchObject({ response: { reason: "no_location" } });
    const noDishes = pilotHarness({ id: "m1", businessType: "restaurant", pilotEnabled: false, location: PIN }, 0);
    await expect(noDishes.svc.setPilot("ops", "m1", { enabled: true })).rejects.toMatchObject({ response: { reason: "no_live_dishes" } });
    expect(noDishes.writes.update).toBeUndefined();
  });

  it("switching off is always allowed and audited as go_dormant", async () => {
    const { svc, writes } = pilotHarness({ id: "m2", businessType: "shop", pilotEnabled: true, location: null }, 0);
    await expect(svc.setPilot("ops", "m2", { enabled: false })).resolves.toMatchObject({ pilotEnabled: false });
    expect(writes.audit).toMatchObject({ action: "merchant.go_dormant" });
  });

  it("is idempotent: setting the current value writes nothing", async () => {
    const { svc, writes } = pilotHarness({ id: "m1", businessType: "restaurant", pilotEnabled: true, location: PIN });
    await expect(svc.setPilot("ops", "m1", { enabled: true })).resolves.toEqual({ id: "m1", pilotEnabled: true, auditId: null });
    expect(writes.update).toBeUndefined();
    expect(writes.audit).toBeUndefined();
  });

  it("404s an unknown merchant", async () => {
    const { svc } = pilotHarness(null);
    await expect(svc.setPilot("ops", "nope", { enabled: true })).rejects.toThrow(/not found/i);
  });

  it("listMerchants: awaiting_go_live is restaurants not yet on; shops is every shop; landmark shown, phone masked", async () => {
    const wheres: unknown[] = [];
    const prisma = {
      merchant: {
        findMany: async ({ where }: { where: unknown }) => {
          wheres.push(where);
          return [
            {
              id: "m1",
              name: "Sadza Republic",
              cashRule: "collect_and_return",
              pilotEnabled: false,
              busyMode: false,
              cuisineTags: [],
              createdAt: new Date("2026-09-29T08:00:00Z"),
              businessType: "restaurant",
              shopKind: null,
              location: PIN,
            },
          ];
        },
      },
      order: { groupBy: async () => [] },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const [row] = await svc.listMerchants("awaiting_go_live");
    await svc.listMerchants("shops");
    await svc.listMerchants();
    expect(wheres).toEqual([{ businessType: "restaurant", pilotEnabled: false }, { businessType: "shop" }, {}]);
    expect(row).toMatchObject({ businessType: "restaurant", shopKind: null, landmark: "Next to the rank", contactPhoneMasked: "+263•••••4567" });
  });
});

describe("AdminMerchantsService.transferOwner (merchant web upgrade L4 — support hands a business over)", () => {
  interface Member { id: string; merchantId: string; profileId: string; role: "owner" | "staff"; displayName: string; addedByProfileId?: string | null }
  interface Person { id: string; phone: string; firstName: string; lastName: string; onHold: boolean; rider: { accountStatus: string } | null }

  /** A small in-memory world: two businesses, their owners, and whoever a test adds. */
  function transferHarness() {
    const people = new Map<string, Person>();
    const merchants = new Map<string, { id: string; name: string; ownerProfileId: string | null }>([
      ["m1", { id: "m1", name: "Mbare Auto Spares", ownerProfileId: "farai" }],
      ["m2", { id: "m2", name: "Sadza Republic", ownerProfileId: "rudo" }],
    ]);
    const members: Member[] = [
      { id: "mm-farai", merchantId: "m1", profileId: "farai", role: "owner", displayName: "Farai Chari" },
      { id: "mm-rudo", merchantId: "m2", profileId: "rudo", role: "owner", displayName: "Rudo Dube" },
    ];
    const invites = [{ id: "inv-1", merchantId: "m1", phone: "+263773000003" }];
    const audit: Array<Record<string, unknown>> = [];
    const add = (p: Partial<Person> & Pick<Person, "id" | "phone">) =>
      people.set(p.id, { firstName: "", lastName: "", onHold: false, rider: null, ...p });
    add({ id: "farai", phone: "+263771000001", firstName: "Farai", lastName: "Chari" });
    add({ id: "rudo", phone: "+263772000002", firstName: "Rudo", lastName: "Dube" });

    let n = 0;
    const prisma: Record<string, unknown> = {
      $executeRaw: async () => 1,
      merchant: {
        findUnique: async ({ where }: { where: { id: string } }) => merchants.get(where.id) ?? null,
        findFirst: async ({ where }: { where: { ownerProfileId: string; id: { not: string } } }) =>
          [...merchants.values()].find((m) => m.ownerProfileId === where.ownerProfileId && m.id !== where.id.not) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: { ownerProfileId: string } }) => Object.assign(merchants.get(where.id)!, data),
      },
      profile: {
        findUnique: async ({ where }: { where: { phone?: string; id?: string } }) =>
          [...people.values()].find((p) => (where.phone ? p.phone === where.phone : p.id === where.id)) ?? null,
      },
      merchantMember: {
        findUnique: async ({ where }: { where: { profileId: string } }) => members.find((m) => m.profileId === where.profileId) ?? null,
        findFirst: async ({ where }: { where: { merchantId: string; role: string } }) =>
          members.find((m) => m.merchantId === where.merchantId && m.role === where.role) ?? null,
        count: async ({ where }: { where: { profileId: string } }) => members.filter((m) => m.profileId === where.profileId).length,
        update: async ({ where, data }: { where: { id: string }; data: { role: "owner" | "staff" } }) => {
          const row = members.find((m) => m.id === where.id)!;
          // The partial unique index: one owner per business.
          if (data.role === "owner" && members.some((m) => m.merchantId === row.merchantId && m.role === "owner" && m.id !== row.id)) {
            throw new Error("unique violation: one owner per business");
          }
          return Object.assign(row, data);
        },
        create: async ({ data }: { data: Omit<Member, "id"> }) => {
          if (data.role === "owner" && members.some((m) => m.merchantId === data.merchantId && m.role === "owner")) {
            throw new Error("unique violation: one owner per business");
          }
          const row = { ...data, id: `mm-${++n}` };
          members.push(row);
          return row;
        },
      },
      merchantInvite: {
        deleteMany: async ({ where }: { where: { merchantId: string; phone: string } }) => {
          const i = invites.findIndex((x) => x.merchantId === where.merchantId && x.phone === where.phone);
          if (i >= 0) invites.splice(i, 1);
          return { count: i >= 0 ? 1 : 0 };
        },
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audit.push(data);
          return { id: `audit-${audit.length}` };
        },
      },
    };
    prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
    return { svc: new AdminMerchantsService(prisma as unknown as PrismaService), people, merchants, members, invites, audit, add };
  }

  const NOTE = "Called Farai and Chipo; saw Chipo's ID at the shop";

  it("promotes a staff member: the old owner stays on as Staff, the column follows, and the audit row carries the note", async () => {
    const h = transferHarness();
    h.add({ id: "chipo", phone: "+263773000003", firstName: "Chipo", lastName: "Moyo" });
    h.members.push({ id: "mm-chipo", merchantId: "m1", profileId: "chipo", role: "staff", displayName: "Chipo" });

    const res = await h.svc.transferOwner("ops@lyniago", "m1", { phone: "0773 000 003", note: NOTE });

    expect(res).toEqual({ id: "m1", ownerProfileId: "chipo", previousOwnerProfileId: "farai", auditId: "audit-1" });
    expect(h.members.filter((m) => m.merchantId === "m1").map((m) => [m.profileId, m.role])).toEqual([
      ["farai", "staff"],
      ["chipo", "owner"],
    ]);
    expect(h.merchants.get("m1")!.ownerProfileId).toBe("chipo");
    expect(h.audit).toEqual([{ actor: "ops@lyniago", action: "merchant.owner_transfer", target: "m1", reasonCode: null, note: NOTE }]);
    // A pending invite to the new owner's number has nothing left to do.
    expect(h.invites).toEqual([]);
  });

  it("hands the business to someone on no business, who joins as its owner under their profile name", async () => {
    const h = transferHarness();
    h.add({ id: "tino", phone: "+263774000004", firstName: "Tinashe", lastName: "Moyo" });
    await h.svc.transferOwner("ops", "m1", { phone: "+263774000004", note: NOTE });
    expect(h.members.find((m) => m.profileId === "tino")).toMatchObject({ merchantId: "m1", role: "owner", displayName: "Tinashe Moyo" });
    expect(h.members.find((m) => m.profileId === "farai")).toMatchObject({ role: "staff" });
  });

  it("refuses someone who works at, or owns, another business", async () => {
    const h = transferHarness();
    await expect(h.svc.transferOwner("ops", "m1", { phone: "+263772000002", note: NOTE })).rejects.toMatchObject({
      status: 409,
      response: { reason: "member_elsewhere" },
    });
    expect(h.members.find((m) => m.profileId === "farai")).toMatchObject({ role: "owner" });
    expect(h.audit).toEqual([]);
  });

  it("refuses a number with no account, a held or restricted account, the current owner, and a bad number", async () => {
    const h = transferHarness();
    await expect(h.svc.transferOwner("ops", "m1", { phone: "+263779999999", note: NOTE })).rejects.toMatchObject({ status: 404, response: { reason: "no_account" } });
    h.add({ id: "held", phone: "+263775000005", onHold: true });
    await expect(h.svc.transferOwner("ops", "m1", { phone: "+263775000005", note: NOTE })).rejects.toMatchObject({ response: { reason: "account_restricted" } });
    h.add({ id: "banned", phone: "+263776000006", rider: { accountStatus: "banned" } });
    await expect(h.svc.transferOwner("ops", "m1", { phone: "+263776000006", note: NOTE })).rejects.toMatchObject({ response: { reason: "account_restricted" } });
    await expect(h.svc.transferOwner("ops", "m1", { phone: "+263771000001", note: NOTE })).rejects.toMatchObject({ response: { reason: "already_owner" } });
    await expect(h.svc.transferOwner("ops", "m1", { phone: "12", note: NOTE })).rejects.toMatchObject({ status: 400, response: { reason: "bad_phone" } });
    await expect(h.svc.transferOwner("ops", "nope", { phone: "+263771000001", note: NOTE })).rejects.toMatchObject({ status: 404 });
    expect(h.audit).toEqual([]);
  });

  it("keeps the old owner on the team as Staff even when their owner row was never backfilled", async () => {
    const h = transferHarness();
    h.members.splice(h.members.findIndex((m) => m.profileId === "farai"), 1);
    h.add({ id: "tino", phone: "+263774000004", firstName: "Tinashe", lastName: "Moyo" });
    const res = await h.svc.transferOwner("ops", "m1", { phone: "+263774000004", note: NOTE });
    expect(res.previousOwnerProfileId).toBe("farai");
    expect(h.members.find((m) => m.profileId === "farai")).toMatchObject({ merchantId: "m1", role: "staff", displayName: "Farai Chari" });
  });
});
