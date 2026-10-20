/**
 * Own bikers (docs/designs/own-bikers.md, ledger D-117): proof that the database guards in migration 0108 hold
 * on a real Postgres, whatever the application code above them does. Needs DATABASE_URL (CI's PostGIS job).
 *
 *  - orders scope check (constraint trigger, at commit): a fleet biker never carries a public or another
 *    owner's job, a public biker never carries a fleet job, and a fleet tag must name the order's own branch.
 *  - riders link guard (OV1): a biker can't join or leave while carrying a live job outside the new scope.
 *  - merchants owner guard (E11): a branch can't change owner while bikers are linked.
 *  - the accept-vs-Join race (OV1) in all three orderings: never both succeed.
 *  - ledger and invite constraints: one charge per order, append-only adjustments, one live invite per phone.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";

const prisma = new PrismaService();

const WAYPOINT = { lat: -17.82, lng: 31.05, landmark: "CBD", contactPhone: "+263770000000" };
const SCOPE_ERROR = /fleet_scope/;
const LINK_ERROR = /fleet_link/;

async function clean(): Promise<void> {
  await prisma.merchantFleetLedger.deleteMany({});
  await prisma.merchantFleetStatement.deleteMany({});
  await prisma.fleetInvite.deleteMany({});
  await prisma.merchantBooking.deleteMany({});
  await prisma.orderEvent.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.rider.deleteMany({});
  await prisma.ownerFleet.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.profile.deleteMany({});
}

async function makeProfile(role: "customer" | "rider" | "merchant"): Promise<string> {
  const p = await prisma.profile.create({
    data: { role, firstName: "Test", lastName: role, phone: `+26377${Math.floor(Math.random() * 1e7)}` },
    select: { id: true },
  });
  return p.id;
}

async function makeOwnerWithBranches(n: number): Promise<{ ownerId: string; branchIds: string[] }> {
  const ownerId = await makeProfile("merchant");
  await prisma.ownerFleet.create({ data: { ownerProfileId: ownerId, enabled: true, rideFee: 1.5 } });
  const branchIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const m = await prisma.merchant.create({ data: { name: `Chicken Inn ${i}`, ownerProfileId: ownerId }, select: { id: true } });
    branchIds.push(m.id);
  }
  return { ownerId, branchIds };
}

async function makeRider(fleet?: { ownerId: string; homeId: string }): Promise<string> {
  const id = await makeProfile("rider");
  await prisma.rider.create({
    data: {
      profileId: id,
      bikeReg: "ABZ 0000",
      kycStatus: "verified",
      fleetOwnerProfileId: fleet?.ownerId ?? null,
      fleetHomeMerchantId: fleet?.homeId ?? null,
      fleetJoinedAt: fleet ? new Date() : null,
    },
  });
  return id;
}

/** A parcel order (public), or with `merchantId` a merchant app order belonging to that branch. */
async function makeOrder(customerId: string, opts: { merchantId?: string; status?: "open_for_offers" | "fleet_searching" } = {}): Promise<string> {
  const o = await prisma.order.create({
    data: {
      customerId,
      merchantId: opts.merchantId ?? null,
      orderType: opts.merchantId ? "merchant" : "parcel",
      pickup: WAYPOINT,
      dropoff: WAYPOINT,
      itemDesc: "chicken",
      declaredValue: 10,
      suggestedFare: 2.5,
      proposedFare: 2.5,
      status: opts.status ?? "open_for_offers",
    },
    select: { id: true },
  });
  return o.id;
}

function assign(orderId: string, riderId: string) {
  return prisma.order.update({ where: { id: orderId }, data: { riderId, status: "assigned" } });
}

function tagFleet(orderId: string, branchId: string) {
  return prisma.order.update({ where: { id: orderId }, data: { fleetMerchantId: branchId, fleetFee: 1.5 } });
}

beforeAll(async () => {
  await prisma.$connect();
});
beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("orders scope check (constraint trigger)", () => {
  it("lets a public biker take a public job", async () => {
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer);
    const rider = await makeRider();
    await expect(assign(order, rider)).resolves.toBeTruthy();
  });

  it("refuses an Own biker on a public job", async () => {
    const { ownerId, branchIds } = await makeOwnerWithBranches(1);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer);
    const rider = await makeRider({ ownerId, homeId: branchIds[0] });
    await expect(assign(order, rider)).rejects.toThrow(SCOPE_ERROR);
    expect((await prisma.order.findUnique({ where: { id: order } }))?.riderId).toBeNull();
  });

  it("refuses a public biker on a fleet job", async () => {
    const { branchIds } = await makeOwnerWithBranches(1);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer, { merchantId: branchIds[0] });
    await tagFleet(order, branchIds[0]);
    const rider = await makeRider();
    await expect(assign(order, rider)).rejects.toThrow(SCOPE_ERROR);
  });

  it("lets an Own biker take their owner's job at any branch", async () => {
    const { ownerId, branchIds } = await makeOwnerWithBranches(2);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer, { merchantId: branchIds[1] });
    await tagFleet(order, branchIds[1]);
    const rider = await makeRider({ ownerId, homeId: branchIds[0] });
    await expect(assign(order, rider)).resolves.toBeTruthy();
  });

  it("refuses an Own biker on another owner's fleet job", async () => {
    const a = await makeOwnerWithBranches(1);
    const b = await makeOwnerWithBranches(1);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer, { merchantId: b.branchIds[0] });
    await tagFleet(order, b.branchIds[0]);
    const rider = await makeRider({ ownerId: a.ownerId, homeId: a.branchIds[0] });
    await expect(assign(order, rider)).rejects.toThrow(SCOPE_ERROR);
  });

  it("refuses a fleet tag that names a branch the order doesn't belong to, even the same owner's", async () => {
    const { branchIds } = await makeOwnerWithBranches(2);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer, { merchantId: branchIds[0] });
    await expect(tagFleet(order, branchIds[1])).rejects.toThrow(SCOPE_ERROR);
    const parcel = await makeOrder(customer);
    await expect(tagFleet(parcel, branchIds[0])).rejects.toThrow(SCOPE_ERROR);
  });

  it("refuses a fleet tag on a branch with no owner", async () => {
    const orphan = await prisma.merchant.create({ data: { name: "No owner" }, select: { id: true } });
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer, { merchantId: orphan.id });
    await expect(tagFleet(order, orphan.id)).rejects.toThrow(SCOPE_ERROR);
  });

  it("accepts a fleet booking whose order and booking rows are written in one transaction (F1)", async () => {
    const { ownerId, branchIds } = await makeOwnerWithBranches(1);
    const customer = await makeProfile("merchant");
    const orderId = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          customerId: customer,
          pickup: WAYPOINT,
          dropoff: WAYPOINT,
          itemDesc: "chicken",
          declaredValue: 10,
          suggestedFare: 0,
          proposedFare: 0,
          status: "fleet_searching",
          fleetMerchantId: branchIds[0],
          fleetFee: 1.5,
        },
        select: { id: true },
      });
      await tx.merchantBooking.create({ data: { orderId: o.id, merchantId: branchIds[0], bookedByProfileId: customer } });
      return o.id;
    });
    const rider = await makeRider({ ownerId, homeId: branchIds[0] });
    await expect(assign(orderId, rider)).resolves.toBeTruthy();
  });

  it("refuses a fleet booking written without its booking row", async () => {
    const { branchIds } = await makeOwnerWithBranches(1);
    const customer = await makeProfile("merchant");
    await expect(
      prisma.order.create({
        data: {
          customerId: customer,
          pickup: WAYPOINT,
          dropoff: WAYPOINT,
          itemDesc: "chicken",
          declaredValue: 10,
          suggestedFare: 0,
          proposedFare: 0,
          status: "fleet_searching",
          fleetMerchantId: branchIds[0],
          fleetFee: 1.5,
        },
      }),
    ).rejects.toThrow(SCOPE_ERROR);
  });

  it("refuses a fleet tag without its fee snapshot, and a fee without a tag", async () => {
    const { branchIds } = await makeOwnerWithBranches(1);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer, { merchantId: branchIds[0] });
    await expect(prisma.order.update({ where: { id: order }, data: { fleetMerchantId: branchIds[0] } })).rejects.toThrow(
      /orders_fleet_fee_pairs_branch/,
    );
    await expect(prisma.order.update({ where: { id: order }, data: { fleetFee: 1.5 } })).rejects.toThrow(/orders_fleet_fee_pairs_branch/);
  });

  it("lets ordinary status writes through untouched", async () => {
    const { ownerId, branchIds } = await makeOwnerWithBranches(1);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer, { merchantId: branchIds[0] });
    await tagFleet(order, branchIds[0]);
    const rider = await makeRider({ ownerId, homeId: branchIds[0] });
    await assign(order, rider);
    for (const status of ["en_route_pickup", "picked_up", "en_route_dropoff", "delivered"] as const) {
      await expect(prisma.order.update({ where: { id: order }, data: { status } })).resolves.toBeTruthy();
    }
  });
});

describe("riders link guard (OV1)", () => {
  it("refuses Join while the biker carries a live public job, and allows it once the job is done", async () => {
    const { ownerId, branchIds } = await makeOwnerWithBranches(1);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer);
    const rider = await makeRider();
    await assign(order, rider);
    const join = () =>
      prisma.rider.update({ where: { profileId: rider }, data: { fleetOwnerProfileId: ownerId, fleetHomeMerchantId: branchIds[0] } });
    await expect(join()).rejects.toThrow(LINK_ERROR);
    await prisma.order.update({ where: { id: order }, data: { status: "delivered" } });
    await expect(join()).resolves.toBeTruthy();
  });

  it("refuses Leave during one of the owner's jobs", async () => {
    const { ownerId, branchIds } = await makeOwnerWithBranches(1);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer, { merchantId: branchIds[0] });
    await tagFleet(order, branchIds[0]);
    const rider = await makeRider({ ownerId, homeId: branchIds[0] });
    await assign(order, rider);
    const leave = () => prisma.rider.update({ where: { profileId: rider }, data: { fleetOwnerProfileId: null, fleetHomeMerchantId: null } });
    await expect(leave()).rejects.toThrow(LINK_ERROR);
    await prisma.order.update({ where: { id: order }, data: { status: "cancelled" } });
    await expect(leave()).resolves.toBeTruthy();
  });

  it("refuses a home branch of another owner, and a home branch on a public biker", async () => {
    const a = await makeOwnerWithBranches(1);
    const b = await makeOwnerWithBranches(1);
    await expect(makeRider({ ownerId: a.ownerId, homeId: b.branchIds[0] })).rejects.toThrow(LINK_ERROR);
    const rider = await makeRider();
    await expect(prisma.rider.update({ where: { profileId: rider }, data: { fleetHomeMerchantId: a.branchIds[0] } })).rejects.toThrow(
      LINK_ERROR,
    );
  });
});

describe("merchants owner guard (E11)", () => {
  it("refuses an owner change while bikers are linked, and allows it once they are not", async () => {
    const { ownerId, branchIds } = await makeOwnerWithBranches(1);
    const other = await makeProfile("merchant");
    const rider = await makeRider({ ownerId, homeId: branchIds[0] });
    const move = () => prisma.merchant.update({ where: { id: branchIds[0] }, data: { ownerProfileId: other } });
    await expect(move()).rejects.toThrow(/fleet_owner/);
    await prisma.rider.update({ where: { profileId: rider }, data: { fleetOwnerProfileId: null, fleetHomeMerchantId: null } });
    await expect(move()).resolves.toBeTruthy();
  });
});

describe("accept vs Join race (OV1): never both", () => {
  /** A deferred that a test resolves to let a held transaction move on. */
  function gate(): { wait: Promise<void>; open: () => void } {
    let open!: () => void;
    const wait = new Promise<void>((r) => (open = r));
    return { wait, open };
  }

  /** Prisma queries are lazy (they run when awaited): this starts one NOW and captures how it settled. */
  function start(q: PromiseLike<unknown>): Promise<{ ok: true } | { ok: false; error: Error }> {
    return Promise.resolve(q).then(
      () => ({ ok: true as const }),
      (error: Error) => ({ ok: false as const, error }),
    );
  }

  async function setup() {
    const { ownerId, branchIds } = await makeOwnerWithBranches(1);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer);
    const rider = await makeRider();
    const join = { fleetOwnerProfileId: ownerId, fleetHomeMerchantId: branchIds[0] };
    return { order, rider, join };
  }

  async function outcome(order: string, rider: string) {
    const o = await prisma.order.findUnique({ where: { id: order }, select: { riderId: true } });
    const r = await prisma.rider.findUnique({ where: { profileId: rider }, select: { fleetOwnerProfileId: true } });
    return { accepted: o?.riderId === rider, joined: r?.fleetOwnerProfileId != null };
  }

  it("the accept is written but not committed when Join commits: the accept fails at commit", async () => {
    const { order, rider, join } = await setup();
    const written = gate();
    const release = gate();
    const accept = start(
      prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order }, data: { riderId: rider, status: "assigned" } });
        written.open();
        await release.wait;
      }),
    );
    await written.wait;
    // Join can't see the uncommitted accept, so its own guard lets it through.
    await prisma.rider.update({ where: { profileId: rider }, data: join });
    release.open();
    const res = await accept;
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.message).toMatch(SCOPE_ERROR);
    expect(await outcome(order, rider)).toEqual({ accepted: false, joined: true });
  });

  it("the accept commits first: Join is refused", async () => {
    const { order, rider, join } = await setup();
    await assign(order, rider);
    await expect(prisma.rider.update({ where: { profileId: rider }, data: join })).rejects.toThrow(LINK_ERROR);
    expect(await outcome(order, rider)).toEqual({ accepted: true, joined: false });
  });

  it("Join holds the rider row while the accept commits: the accept waits on FOR SHARE, then fails", async () => {
    const { order, rider, join } = await setup();
    const locked = gate();
    const release = gate();
    const joining = start(
      prisma.$transaction(async (tx) => {
        await tx.rider.update({ where: { profileId: rider }, data: join });
        locked.open();
        await release.wait;
      }),
    );
    await locked.wait;
    // Join's own guard has already run (no live job then). The accept now commits while Join holds the row.
    const accept = start(assign(order, rider));
    await new Promise((r) => setTimeout(r, 300));
    release.open();
    expect((await joining).ok).toBe(true);
    const res = await accept;
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.message).toMatch(SCOPE_ERROR);
    expect(await outcome(order, rider)).toEqual({ accepted: false, joined: true });
  });
});

describe("billing and invite constraints", () => {
  it("allows one charge per order and any number of append-only adjustments", async () => {
    const { ownerId, branchIds } = await makeOwnerWithBranches(1);
    const customer = await makeProfile("customer");
    const order = await makeOrder(customer, { merchantId: branchIds[0] });
    const charge = { ownerProfileId: ownerId, merchantId: branchIds[0], orderId: order, kind: "booking" as const, fee: 1.5 };
    await prisma.merchantFleetLedger.create({ data: charge });
    await expect(prisma.merchantFleetLedger.create({ data: { ...charge, kind: "marketplace" } })).rejects.toThrow();
    const credit = { ...charge, kind: "adjustment" as const, fee: -1.5, actorProfileId: ownerId, reason: "cancelled before pickup" };
    await prisma.merchantFleetLedger.create({ data: credit });
    await expect(prisma.merchantFleetLedger.create({ data: credit })).resolves.toBeTruthy();
    await expect(prisma.merchantFleetLedger.create({ data: { ...credit, reason: null } })).rejects.toThrow(/charge_shape/);
    await expect(prisma.merchantFleetLedger.create({ data: { ...charge, orderId: null } })).rejects.toThrow(/charge_shape/);
  });

  it("keeps one live invite per owner and phone; a revoked one frees the number", async () => {
    const { ownerId, branchIds } = await makeOwnerWithBranches(1);
    const invite = (token: string) =>
      prisma.fleetInvite.create({
        data: {
          ownerProfileId: ownerId,
          homeMerchantId: branchIds[0],
          phone: "+263771234567",
          displayName: "Kuda",
          token,
          invitedByProfileId: ownerId,
          expiresAt: new Date(Date.now() + 7 * 864e5),
        },
      });
    const first = await invite("t1");
    await expect(invite("t2")).rejects.toThrow();
    await prisma.fleetInvite.update({ where: { id: first.id }, data: { revokedAt: new Date() } });
    await expect(invite("t3")).resolves.toBeTruthy();
    await expect(prisma.fleetInvite.update({ where: { id: first.id }, data: { joinedAt: new Date() } })).rejects.toThrow(/one_ending/);
  });

  it("a fleet is on by default and needs no fee (owner, 2026-10-20: billed at the commission rate)", async () => {
    const ownerId = await makeProfile("merchant");
    await expect(prisma.ownerFleet.create({ data: { ownerProfileId: ownerId } })).resolves.toMatchObject({ enabled: true, rideFee: null });
  });
});
