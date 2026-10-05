import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { PaymentRail } from "../adapters/payments/payment-rail.interface";
import type { FoodDebtService } from "./food-debt.service";
import { FoodOrderService, HANDOVER_LINK_TTL_S } from "./food-order.service";
import { withMembershipShim } from "./testing/membership-shim";

// Merchant v2 (ledger D-77): the offline-rider hand-over fallback ("Rider can't enter code").

const tokens = new TokenService({ JWT_SIGNING_SECRET: "handover-link-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
const ORDER = "a1b20000-0000-4000-8000-000000000000";
const RIDER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-05T10:00:00Z");
const CODE_HASH = tokens.hash("731604");

function build(over: { order?: Record<string, unknown>; env?: Partial<Env> } = {}) {
  const audit: Array<Record<string, unknown>> = [];
  const row = { id: ORDER, merchantId: "m1", orderType: "merchant", status: "en_route_pickup", riderId: RIDER, pickupCodeHash: CODE_HASH, rider: { profile: { phone: "+263772222222" } }, merchant: { name: "Sadza Republic" }, ...over.order };
  const prisma = withMembershipShim({
    merchant: { findUnique: async () => ({ id: "m1" }) },
    order: { findFirst: async () => row, findUnique: async () => row },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => audit.push(data) },
  } as Record<string, unknown>);
  const env = { MERCHANT_WEB_URL: "https://merchant.example/", ...over.env } as Env;
  const svc = new FoodOrderService(
    prisma as unknown as PrismaService,
    tokens,
    {} as NotificationsService,
    {} as FoodDebtService,
    { emitFoodQueueChanged: () => {} } as unknown as TrackingGateway,
    {} as PaymentRail,
    undefined,
    undefined,
    env,
  );
  return { svc, audit, row };
}

const tokenOf = (link: string) => link.split("/h/")[1]!;

describe("the offline-rider hand-over link (Merchant v2, D-77)", () => {
  it("mints a 15-minute link for the assigned rider, with their number, and audit-logs who asked", async () => {
    const { svc, audit } = build();
    const res = await svc.createHandoverLink("owner-1", ORDER, NOW);
    expect(res.link).toMatch(/^https:\/\/merchant\.example\/h\/a1b20000-0000-4000-8000-000000000000\.\d{10}\.[0-9a-f]{32}$/);
    expect(res.expiresAt).toBe(new Date(NOW.getTime() + HANDOVER_LINK_TTL_S * 1000).toISOString());
    expect(res.riderPhone).toBe("+263772222222");
    expect(audit).toEqual([{ actor: "owner-1", action: "order.handover_link", target: ORDER }]);
  });

  it("is unavailable without MERCHANT_WEB_URL, and only while a rider is on the way to the counter", async () => {
    await expect(build({ env: { MERCHANT_WEB_URL: undefined } }).svc.createHandoverLink("owner-1", ORDER, NOW)).rejects.toThrow("This isn't available yet.");
    await expect(build({ order: { status: "picked_up" } }).svc.createHandoverLink("owner-1", ORDER, NOW)).rejects.toThrow("There's no rider on the way");
  });

  it("names the order and venue on the rider's page", async () => {
    const { svc } = build();
    const token = tokenOf((await svc.createHandoverLink("owner-1", ORDER, NOW)).link);
    expect(await svc.handoverLinkInfo(token, NOW)).toEqual({ orderLabel: "#A1B2", venueName: "Sadza Republic", expiresAt: expect.any(String) });
  });

  it("confirms through the in-app pickup (same code check) and audit-logs the use", async () => {
    const { svc, audit } = build();
    const token = tokenOf((await svc.createHandoverLink("owner-1", ORDER, NOW)).link);
    const confirm = vi.spyOn(svc, "confirmPickup").mockResolvedValue({ orderId: ORDER, status: "picked_up" });
    expect(await svc.confirmHandoverLink(token, "731604", NOW)).toEqual({ orderId: ORDER, status: "picked_up" });
    expect(confirm).toHaveBeenCalledWith(ORDER, RIDER, "731604");
    expect(audit.at(-1)).toEqual({ actor: RIDER, action: "order.handover_link_used", target: ORDER });
  });

  it("refuses an expired, tampered, reused or re-minted link — one uniform answer", async () => {
    const { svc } = build();
    const token = tokenOf((await svc.createHandoverLink("owner-1", ORDER, NOW)).link);
    const later = new Date(NOW.getTime() + (HANDOVER_LINK_TTL_S + 1) * 1000);
    await expect(svc.handoverLinkInfo(token, later)).rejects.toThrow("This link has expired");
    await expect(svc.handoverLinkInfo(token.replace(/.$/, (c) => (c === "0" ? "1" : "0")), NOW)).rejects.toThrow("This link has expired");
    await expect(svc.handoverLinkInfo("not-a-token", NOW)).rejects.toThrow("This link has expired");
    // Used: after pickup the order is no longer on the way to the counter.
    await expect(build({ order: { status: "picked_up" } }).svc.handoverLinkInfo(token, NOW)).rejects.toThrow("This link has expired");
    // The counter revealed a fresh code (the hash moved), or another rider took it.
    await expect(build({ order: { pickupCodeHash: tokens.hash("111222") } }).svc.handoverLinkInfo(token, NOW)).rejects.toThrow("This link has expired");
    await expect(build({ order: { riderId: "22222222-2222-4222-8222-222222222222" } }).svc.handoverLinkInfo(token, NOW)).rejects.toThrow("This link has expired");
  });

  it("a wrong merchant can't mint one for someone else's order", async () => {
    const { svc } = build({ order: {} });
    (svc as unknown as { prisma: { order: { findFirst: () => Promise<null> } } }).prisma.order.findFirst = async () => null;
    await expect(svc.createHandoverLink("someone-else", ORDER, NOW)).rejects.toThrow("Order not found");
  });
});
