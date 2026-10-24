/**
 * Review fixes 2026-10-24 (admin merchant approvals): the application checks against a real Postgres. The unit
 * fakes ignore `where`, so the relation filters (hidden categories, unlisted prescription items), the
 * per-business latest call (`distinct`) and the queue / SLA filters are only proven here. Needs DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { AdminMerchantApplicationService, MERCHANT_APPLICATION_AUDIT } from "./admin-merchant-application.service";
import { AdminMerchantsService } from "./admin-merchants.service";
import { applicationsPastSlaWhere } from "./admin.service";

const prisma = new PrismaService();
const env = { RX_ENABLED: "false", RESTAURANTS_ENABLED: "true", SHOPS_ENABLED: "true", PHARMACY_ENABLED: "true" } as unknown as Env;
const app = new AdminMerchantApplicationService(prisma, env);
const merchants = new AdminMerchantsService(prisma, undefined, app);
const PIN = { point: { lat: -17.83, lng: 31.05 }, landmark: "Next to the rank", contactPhone: "+263771234567" };
const HOURS = { mon: { open: "08:00", close: "20:00" } };

async function clean(): Promise<void> {
  await prisma.auditLog.deleteMany({});
  await prisma.domainEvent.deleteMany({});
  await prisma.merchantDish.deleteMany({});
  await prisma.merchantCategory.deleteMany({});
  await prisma.merchantMember.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.profile.deleteMany({});
}

/** A business in review whose owner is set up, with one category (hidden or not) holding one dish. */
async function business(name: string, over: { hidden?: boolean; rx?: boolean; createdAt?: Date; status?: "applied" | "reviewing" | "approved" } = {}) {
  const owner = await prisma.profile.create({
    data: { role: "customer", firstName: "Tendai", lastName: "M", phone: `o_${crypto.randomUUID()}`, phoneVerifiedAt: new Date() },
    select: { id: true },
  });
  const m = await prisma.merchant.create({
    data: { name, ownerProfileId: owner.id, location: PIN, hours: HOURS, applicationStatus: over.status ?? "reviewing", ...(over.createdAt ? { createdAt: over.createdAt } : {}) },
    select: { id: true },
  });
  await prisma.merchantMember.create({ data: { merchantId: m.id, profileId: owner.id, role: "owner", displayName: "Tendai M", termsAcceptedAt: new Date() } });
  const c = await prisma.merchantCategory.create({ data: { merchantId: m.id, name: "Mains", hidden: over.hidden ?? false }, select: { id: true } });
  await prisma.merchantDish.create({ data: { merchantId: m.id, categoryId: c.id, name: "Sadza", priceUsd: 5, photoUrl: "dish/x.jpg", isDraft: false, rxRequired: over.rx ?? false } });
  return m.id;
}

beforeAll(async () => {
  await prisma.$connect();
});
beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("application checks against Postgres (review fixes 2026-10-24)", () => {
  it("a menu whose only dish sits in a hidden category doesn't pass, and can't go live", async () => {
    const id = await business("Hidden Menu", { hidden: true });
    await app.logCall("ops", id, { outcome: "reached" });
    const a = await app.getApplication(id);
    expect(a.checklist.find((r) => r.key === "menu")).toMatchObject({ ok: false });
    await prisma.merchant.update({ where: { id }, data: { applicationStatus: "approved" } });
    await expect(app.transition("ops", id, "go_live", { reason: "x" })).rejects.toMatchObject({ response: { reason: "no_live_dishes" } });
    await prisma.merchantCategory.updateMany({ where: { merchantId: id }, data: { hidden: false } });
    await expect(app.transition("ops", id, "go_live", { reason: "x" })).resolves.toMatchObject({ status: "live" });
  });

  it("with prescriptions off, a prescription-only item doesn't count", async () => {
    const id = await business("Rx Only", { rx: true });
    expect((await app.getApplication(id)).checklist.find((r) => r.key === "menu")).toMatchObject({ ok: false });
  });

  it("the queue scores each business on its own latest call, and a call before a rejection doesn't count", async () => {
    const a = await business("Called Kitchen");
    const b = await business("Rejected Then Reopened");
    await app.logCall("ops", a, { outcome: "reached" });
    await app.logCall("ops", b, { outcome: "reached" });
    await app.transition("ops", b, "reject", { reason: "menu_incomplete" });
    await app.transition("ops", b, "review", { reason: "Reopening after they fixed it" });
    // Many no-answer calls on another business can't push these out any more (no shared cap).
    for (let i = 0; i < 5; i++) await app.logCall("ops", a, { outcome: "no_answer" });
    const rows = await merchants.listMerchants(undefined, "waiting");
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect(byName.get("Called Kitchen")).toMatchObject({ score: { passed: 5, total: 5 } });
    expect(byName.get("Rejected Then Reopened")).toMatchObject({ applicationStatus: "reviewing", score: { passed: 4, total: 5 }, sla: "ok" });
    const audits = await prisma.auditLog.count({ where: { action: MERCHANT_APPLICATION_AUDIT.call } });
    expect(audits).toBe(7);
  });

  it("the 24h badge counts from the last time a business entered the queue", async () => {
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const stale = await business("Waiting Three Days", { createdAt: old, status: "applied" });
    const reopened = await business("Reopened Today", { createdAt: old });
    await prisma.merchant.update({ where: { id: reopened }, data: { applicationQueuedAt: new Date() } });
    const counted = await prisma.merchant.findMany({ where: applicationsPastSlaWhere(), select: { id: true } });
    expect(counted.map((m) => m.id)).toEqual([stale]);
  });

  it("the suspend modal's counts read (open orders, scheduled ones not started)", async () => {
    const id = await business("Quiet Kitchen", { status: "approved" });
    await expect(app.getApplication(id)).resolves.toMatchObject({ orders: { open: 0, scheduled: 0 }, section: { name: "Restaurants", enabled: true } });
  });
});
