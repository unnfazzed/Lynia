import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { MerchantAccess } from "./merchant-access";
import { MerchantRidersService, RIDER_ADD_ACTION, RIDER_REMOVE_ACTION } from "./merchant-riders.service";

/* ── An in-memory slice of the tables Your riders touches ─────────────────────────────────────── */

interface Person {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  onHold: boolean;
  rider: { kycStatus: string; accountStatus: string; onHold: boolean; isOnline?: boolean; lastHeartbeatAt?: Date | null } | null;
  merchantMembership: { merchantId: string } | null;
}
interface Row { id: string; merchantId: string; phone: string; label: string; addedByProfileId: string; createdAt: Date }
interface Audit { actor: string; action: string; target: string; note: string | null; createdAt: Date }

let seq = 0;

function makeWorld() {
  const people = new Map<string, Person>();
  const rows: Row[] = [];
  const audit: Audit[] = [];
  let stats: Array<{ rider_id: string; jobs: bigint; rating: number | null }> = [];

  const person = (over: Partial<Person> & Pick<Person, "id" | "phone">): Person => ({
    firstName: "Blessing",
    lastName: "Moyo",
    photoUrl: null,
    onHold: false,
    rider: { kycStatus: "verified", accountStatus: "active", onHold: false },
    merchantMembership: null,
    ...over,
  });

  const prisma = {
    merchantPreferredRider: {
      findMany: async ({ where }: { where: { merchantId: string } }) => rows.filter((r) => r.merchantId === where.merchantId),
      count: async ({ where }: { where: { merchantId: string } }) => rows.filter((r) => r.merchantId === where.merchantId).length,
      create: async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
        if (rows.some((r) => r.merchantId === data.merchantId && r.phone === data.phone)) {
          throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });
        }
        const row = { ...data, id: `row-${++seq}`, createdAt: new Date() };
        rows.push(row);
        return { id: row.id };
      },
      deleteMany: async ({ where }: { where: { id: string; merchantId: string } }) => {
        const i = rows.findIndex((r) => r.id === where.id && r.merchantId === where.merchantId);
        if (i < 0) return { count: 0 };
        rows.splice(i, 1);
        return { count: 1 };
      },
    },
    profile: {
      findMany: async ({ where }: { where: { phone: { in: string[] } } }) => [...people.values()].filter((p) => where.phone.in.includes(p.phone)),
      findUnique: async ({ where }: { where: { phone: string } }) => (where.phone === "business:m1" ? { id: "acct-m1" } : null),
    },
    merchantMember: {
      count: async ({ where }: { where: { merchantId: string; profile: { phone: string } } }) =>
        [...people.values()].filter((p) => p.phone === where.profile.phone && p.merchantMembership?.merchantId === where.merchantId).length,
    },
    auditLog: {
      count: async ({ where }: { where: { action: string; target: string; createdAt: { gte: Date } } }) =>
        audit.filter((a) => a.action === where.action && a.target === where.target && a.createdAt >= where.createdAt.gte).length,
      create: vi.fn(async ({ data }: { data: Omit<Audit, "createdAt"> }) => {
        audit.push({ ...data, createdAt: new Date() });
        return data;
      }),
    },
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => stats),
    $transaction: async (cb: (tx: unknown) => unknown) => cb(prisma),
  };

  const svc = new MerchantRidersService(prisma as unknown as PrismaService);
  const setStats = (s: typeof stats) => {
    stats = s;
  };
  return { svc, prisma, people, rows, audit, person, setStats };
}

const OWNER: MerchantAccess = { merchantId: "m1", role: "owner", businessType: "restaurant" };

let w: ReturnType<typeof makeWorld>;
beforeEach(() => {
  w = makeWorld();
});

function keep(phone: string, label: string, merchantId = "m1") {
  w.rows.push({ id: `row-${++seq}`, merchantId, phone, label, addedByProfileId: "owner", createdAt: new Date(Date.now() - 1000 * seq) });
}

describe("MerchantRidersService.list (merchant web upgrade L3)", () => {
  it("says only whether each number is an approved rider, can't take jobs right now, or isn't a rider yet", async () => {
    w.people.set("ok", w.person({ id: "ok", phone: "+263771000001" }));
    w.people.set("suspended", w.person({ id: "suspended", phone: "+263771000002", rider: { kycStatus: "verified", accountStatus: "suspended", onHold: false } }));
    w.people.set("held", w.person({ id: "held", phone: "+263771000003", rider: { kycStatus: "verified", accountStatus: "active", onHold: true } }));
    w.people.set("customerHeld", w.person({ id: "customerHeld", phone: "+263771000004", onHold: true }));
    w.people.set("team", w.person({ id: "team", phone: "+263771000005", merchantMembership: { merchantId: "m1" } }));
    w.people.set("kyc", w.person({ id: "kyc", phone: "+263771000006", rider: { kycStatus: "pending", accountStatus: "active", onHold: false } }));
    w.people.set("customer", w.person({ id: "customer", phone: "+263771000007", rider: null }));
    for (const n of ["01", "02", "03", "04", "05", "06", "07", "08"]) keep(`+2637710000${n}`, `Rider ${n}`);
    keep("+263779999999", "Someone else's", "m2");

    const { riders, cap } = await w.svc.list(OWNER);

    expect(cap).toBe(20);
    expect(riders.map((r) => [r.label, r.status])).toEqual([
      ["Rider 01", "on_lyniago"],
      ["Rider 02", "unavailable"],
      ["Rider 03", "unavailable"],
      ["Rider 04", "unavailable"],
      ["Rider 05", "unavailable"],
      ["Rider 06", "not_on_lyniago"],
      ["Rider 07", "not_on_lyniago"],
      ["Rider 08", "not_on_lyniago"],
    ]);
    expect(riders[0]!.phoneMasked).toBe("+263•••••0001");
    // The number comes back whole only where the business needs it to send the sign-up link.
    expect(riders.map((r) => r.invitePhone)).toEqual([null, null, null, null, null, "263771000006", "263771000007", "263771000008"]);
  });

  it("D-48 E4: says Online only for a rider who can take jobs and whose app still heartbeats", async () => {
    const live = { kycStatus: "verified", accountStatus: "active", onHold: false, isOnline: true, lastHeartbeatAt: new Date() };
    w.people.set("on", w.person({ id: "on", phone: "+263771000001", rider: live }));
    w.people.set("stale", w.person({ id: "stale", phone: "+263771000002", rider: { ...live, lastHeartbeatAt: new Date(Date.now() - 10 * 60_000) } }));
    w.people.set("off", w.person({ id: "off", phone: "+263771000003", rider: { ...live, isOnline: false } }));
    w.people.set("held", w.person({ id: "held", phone: "+263771000004", rider: { ...live, onHold: true } }));
    for (const n of ["01", "02", "03", "04"]) keep(`+2637710000${n}`, `Rider ${n}`);

    const { riders } = await w.svc.list(OWNER);

    expect(riders.map((r) => [r.status, r.online])).toEqual([
      ["on_lyniago", true],
      ["on_lyniago", false],
      ["on_lyniago", false],
      ["unavailable", false],
    ]);
  });

  it("shows the rider's own name, photo, jobs and rating only once they've worked for this business", async () => {
    w.people.set("new", w.person({ id: "new", phone: "+263771000001", firstName: "Nyasha", lastName: "Banda" }));
    w.people.set("regular", w.person({ id: "regular", phone: "+263771000002", firstName: "Farai", lastName: "Chari", photoUrl: "https://cdn/p.jpg" }));
    keep("+263771000001", "Nyasha");
    keep("+263771000002", "Big Farai");
    w.setStats([{ rider_id: "regular", jobs: 12n, rating: 4.8666 }]);

    const [fresh, regular] = (await w.svc.list(OWNER)).riders;

    expect(fresh).toMatchObject({ label: "Nyasha", jobs: 0, ratingAvg: null, rider: null });
    expect(regular).toMatchObject({ label: "Big Farai", jobs: 12, ratingAvg: 4.9, rider: { name: "Farai Chari", photoUrl: "https://cdn/p.jpg" } });
  });

  it("is an empty list, and no stats query, for a business with no riders yet", async () => {
    expect(await w.svc.list(OWNER)).toEqual({ riders: [], cap: 20 });
    expect(w.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("MerchantRidersService.add (owner only; the controller's @OwnerOnly)", () => {
  it("keeps the number in +263 form under the business's label, audit-logged, and answers with its status", async () => {
    w.people.set("r", w.person({ id: "r", phone: "+263772223333" }));

    const added = await w.svc.add(OWNER, "owner", { label: "Blessing", phone: "0772 223 333" });

    expect(w.rows).toEqual([expect.objectContaining({ merchantId: "m1", phone: "+263772223333", label: "Blessing", addedByProfileId: "owner" })]);
    expect(added).toMatchObject({ label: "Blessing", status: "on_lyniago", invitePhone: null });
    expect(w.audit).toEqual([expect.objectContaining({ actor: "owner", action: RIDER_ADD_ACTION, target: "m1", note: added.id })]);
    // Serialised per business, so two adds at once can't both pass the limits.
    expect(w.prisma.$executeRaw).toHaveBeenCalled();
  });

  it("refuses a number that isn't a phone number", async () => {
    await expect(w.svc.add(OWNER, "owner", { label: "X", phone: "12ab" })).rejects.toMatchObject({ status: 400, response: { reason: "bad_phone" } });
  });

  it("refuses someone on the business's own team (they'd deliver its own jobs)", async () => {
    w.people.set("cook", w.person({ id: "cook", phone: "+263772223333", merchantMembership: { merchantId: "m1" } }));
    await expect(w.svc.add(OWNER, "owner", { label: "Cook", phone: "0772223333" })).rejects.toMatchObject({ status: 409, response: { reason: "team_member" } });
    expect(w.rows).toHaveLength(0);
  });

  it("keeps at most 20", async () => {
    for (let i = 0; i < 20; i++) keep(`+2637710100${String(i).padStart(2, "0")}`, `R${i}`);
    await expect(w.svc.add(OWNER, "owner", { label: "One more", phone: "0772223333" })).rejects.toMatchObject({
      status: 409,
      response: { reason: "cap_reached", message: "You can keep up to 20 riders. Remove one to add another." },
    });
  });

  it("adds at most 10 a day, removals don't give adds back", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await w.svc.add(OWNER, "owner", { label: `R${i}`, phone: `07710100${String(i).padStart(2, "0")}` });
      if (i < 5) await w.svc.remove(OWNER, "owner", r.id);
    }
    await expect(w.svc.add(OWNER, "owner", { label: "Eleventh", phone: "0772223333" })).rejects.toMatchObject({
      status: 429,
      response: { reason: "too_many_adds" },
    });
  });

  it("says so when the number is already on the list", async () => {
    await w.svc.add(OWNER, "owner", { label: "Blessing", phone: "0772223333" });
    await expect(w.svc.add(OWNER, "owner", { label: "Again", phone: "+263 77 222 3333" })).rejects.toMatchObject({
      status: 409,
      response: { reason: "already_added" },
    });
  });
});

describe("MerchantRidersService.remove", () => {
  it("removes the business's own row, audit-logged", async () => {
    keep("+263772223333", "Blessing");
    const id = w.rows[0]!.id;
    expect(await w.svc.remove(OWNER, "owner", id)).toEqual({ ok: true });
    expect(w.rows).toHaveLength(0);
    expect(w.audit).toEqual([expect.objectContaining({ action: RIDER_REMOVE_ACTION, target: "m1", note: id })]);
  });

  it("reads another business's row as missing, never forbidden, and changes nothing", async () => {
    keep("+263772223333", "Theirs", "m2");
    await expect(w.svc.remove(OWNER, "owner", w.rows[0]!.id)).rejects.toMatchObject({ status: 404 });
    expect(w.rows).toHaveLength(1);
    expect(w.audit).toHaveLength(0);
  });
});
