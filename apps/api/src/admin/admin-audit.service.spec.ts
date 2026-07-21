import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { FEED_READ_ACTIONS } from "../notifications/notifications-feed.service";
import { PrismaService } from "../prisma/prisma.service";
import { AdminAuditService, RESERVED_AUDIT_ACTIONS } from "./admin-audit.service";

describe("AdminAuditService.recordAuditAction (A-01)", () => {
  it("persists an audit row with actor + action fields and returns the id", async () => {
    let created: unknown;
    const prisma = {
      auditLog: {
        create: async (args: { data: unknown }) => {
          created = args.data;
          return { id: "audit-1" };
        },
      },
    };
    const svc = new AdminAuditService(prisma as unknown as PrismaService);
    // A genuinely free-text action (no dedicated domain endpoint owns it) still records unaffected.
    const res = await svc.recordAuditAction("admin-42", {
      action: "order.nudge_rider",
      target: "Tendai M",
      reasonCode: "Safety report from a customer",
      note: "incident #7",
    });
    expect(res).toEqual({ id: "audit-1" });
    expect(created).toEqual({
      actor: "admin-42",
      action: "order.nudge_rider",
      target: "Tendai M",
      reasonCode: "Safety report from a customer",
      note: "incident #7",
    });
  });

  // DS16-01: the generic free-text path must reject any action string that a dedicated domain-mutation
  // endpoint owns (which writes its own audit row transactionally), so an admin can't forge an
  // account-status feed row ("rider.ban" → "Account blocked") or pollute the compliance trail with an
  // entry indistinguishable from a real mutation's.
  it("rejects a reserved domain-mutation action without writing a row", async () => {
    let createCalls = 0;
    const prisma = {
      auditLog: { create: async () => { createCalls++; return { id: "should-not-happen" }; } },
    };
    const svc = new AdminAuditService(prisma as unknown as PrismaService);
    // UX17-02/UX18-05: order.rider_standing_notice/resolved are read back by feedForUser (target=orderId)
    // as the customer rider-standing feed fallback, so the free-text path must reject them too (no forged
    // feed rows).
    for (const action of [
      "rider.ban",
      "rider.kyc_approve",
      "wallet.credit",
      "order.cancel",
      "order.rider_standing_notice",
      "order.rider_standing_resolved",
    ]) {
      await expect(svc.recordAuditAction("admin-42", { action, target: "victim-profile-id" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(createCalls).toBe(0);
  });

  // WD-023: RiderService.adminSetKyc writes "rider.kyc_expire"/"rider.kyc_reset" (alongside the already-
  // reserved kyc_approve/kyc_decline) from the SAME transactional endpoint, and applyKycResult's automated
  // webhook path writes "rider.kyc_review_required" — all three were missing from RESERVED_AUDIT_ACTIONS,
  // so an admin-token holder could forge a clean AuditLog row claiming a real KYC decision/flag that never
  // happened, indistinguishable from a genuine one.
  it("rejects the KYC-decision siblings kyc_expire / kyc_reset / kyc_review_required (WD-023)", async () => {
    let createCalls = 0;
    const prisma = {
      auditLog: { create: async () => { createCalls++; return { id: "should-not-happen" }; } },
    };
    const svc = new AdminAuditService(prisma as unknown as PrismaService);
    for (const action of ["rider.kyc_expire", "rider.kyc_reset", "rider.kyc_review_required"]) {
      await expect(svc.recordAuditAction("admin-42", { action, target: "victim-profile-id" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(createCalls).toBe(0);
  });

  // DS21-02: notifyRidersAvailable writes order.riders_available_notify (order-scoped) and
  // customer.riders_available_notify (profile-scoped), both read back by feedForUser to synthesize an
  // "A rider's online near you" row. They were added in UX21-02 but never reserved here — the same
  // un-propagated-sibling drift WD-023 fixed for the KYC strings — so an admin-token holder could forge a
  // compliance row / a victim's fake feed notification. The free-text path must now reject both.
  it("rejects the notify-riders-available feed actions (DS21-02)", async () => {
    let createCalls = 0;
    const prisma = {
      auditLog: { create: async () => { createCalls++; return { id: "should-not-happen" }; } },
    };
    const svc = new AdminAuditService(prisma as unknown as PrismaService);
    for (const action of ["order.riders_available_notify", "customer.riders_available_notify"]) {
      await expect(svc.recordAuditAction("admin-42", { action, target: "victim-profile-id" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(createCalls).toBe(0);
  });

  // DS21-02 write-time guard (converts the recurring drift into a build-time invariant): EVERY action string
  // the feed synthesizer reads back to render a row (FEED_READ_ACTIONS — the ACCOUNT_FEED_COPY keys plus the
  // inline order-scoped literals in feedForUser) MUST be reserved, so the generic audit-write path can never
  // forge a feed row. This fails automatically the next time a feed-read action is added without reserving
  // it — so the audit-forgery class (WD-023, then UX21-02/DS21-02) can't recur a third time.
  it("reserves every action the feed synthesizer reads back (FEED_READ_ACTIONS ⊆ RESERVED_AUDIT_ACTIONS)", () => {
    const unreserved = FEED_READ_ACTIONS.filter((a) => !RESERVED_AUDIT_ACTIONS.has(a));
    expect(unreserved).toEqual([]);
  });

  it("coerces missing reasonCode/note to null (nullable columns)", async () => {
    let created: { reasonCode?: unknown; note?: unknown } = {};
    const prisma = {
      auditLog: { create: async (args: { data: typeof created }) => { created = args.data; return { id: "a2" }; } },
    };
    const svc = new AdminAuditService(prisma as unknown as PrismaService);
    await svc.recordAuditAction("admin-1", { action: "order.nudge_rider", target: "o1" });
    expect(created.reasonCode).toBeNull();
    expect(created.note).toBeNull();
  });
});
