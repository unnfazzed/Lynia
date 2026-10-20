/**
 * Contracts: Own bikers, merchant and admin sides (ledger D-117). Re-exported by ../contracts.ts
 * (the front door).
 */
import { z } from "zod";
import { FareUsd } from "./core";
import { PublicWaypoint } from "./realtime";
import { CreateMerchantBookingRequest, MerchantBookingResponse } from "./merchant-bookings";

// ── Own bikers (docs/designs/own-bikers.md, ledger D-117; handoff own-bikers-v1) ─────────────────────────
// A merchant owner's own bikers, invited by a link bound to their phone number (no SMS: the owner shares it).
// Responses are NOT .strict(): the biker app is installed and these grow additively (cash held, cancels, bill).

/** How long an Own bikers invite link works (handoff `m.linkSub`: "Works for 7 days, for this number only."). */
export const FLEET_INVITE_TTL_DAYS = 7;
/** Invite links an owner may create per day, across their branches (E4: abuse guard; E13: one at a time). */
export const FLEET_INVITES_PER_DAY = 30;
/** Where an invite link points: `<base><code>`. The app opens it (the code is redeemed by `POST /fleet/invites/open`). */
export const FLEET_INVITE_LINK_BASE = "https://lyniago.com/j/";
/** Invite codes use the referral alphabet (no 0/O/1/I/L) at this length: unguessable, and bound to one number. */
export const FLEET_INVITE_CODE_LENGTH = 10;

/** `POST /merchant/fleet/invites` (owner): who to invite. Their home branch is the branch the owner invites from. */
export const CreateFleetInviteRequest = z
  .object({
    name: z.string().trim().min(1).max(60),
    phone: z.string().trim().min(6).max(20),
  })
  .strict();
export type CreateFleetInviteRequest = z.infer<typeof CreateFleetInviteRequest>;

/** An invite on the owner's roster (OB-M2 "INVITES"). `expired` shows "Link expired · New link". */
export const FleetInviteState = z.enum(["not_opened", "signing_up", "waiting_id_check", "expired"]);
export type FleetInviteState = z.infer<typeof FleetInviteState>;

export const FleetInviteRow = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phoneMasked: z.string(),
  state: FleetInviteState,
  homeBranch: z.string(),
  sharedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type FleetInviteRow = z.infer<typeof FleetInviteRow>;

/**
 * `POST /merchant/fleet/invites` and `GET /merchant/fleet/invites/:id/link` (owner): the link to share. `phone` is
 * the invitee's number as digits for wa.me; `alreadyInvited` = a live invite for this number already existed,
 * and this is its same link (handoff `m.alreadyInvited`).
 */
export const FleetInviteLinkResponse = z.object({
  invite: FleetInviteRow,
  link: z.string().url(),
  phone: z.string(),
  alreadyInvited: z.boolean(),
});
export type FleetInviteLinkResponse = z.infer<typeof FleetInviteLinkResponse>;

/** A biker's state chip on the roster (handoff: On a job › Online › Offline). */
export const FleetBikerState = z.enum(["on_a_job", "online", "offline"]);
export type FleetBikerState = z.infer<typeof FleetBikerState>;

export const FleetBikerRow = z.object({
  riderId: z.string().uuid(),
  name: z.string(),
  /** Full number for the owner (the biker sheet's Call); masked for staff. */
  phone: z.string(),
  homeBranch: z.string(),
  state: FleetBikerState,
  joinedAt: z.string().datetime(),
  /** OV-F3 (`m.cashWith`): cash on delivery they hold that is owed to this owner's branches; null = none. */
  cashHeld: z.string().nullable(),
  /** OV-F2 (`m.cancels`): fleet jobs they gave back this week (Harare, Monday to Sunday). */
  cancelsThisWeek: z.number().int(),
});
export type FleetBikerRow = z.infer<typeof FleetBikerRow>;

/** OB-M5: one of the owner's old Preferred riders, offered once as an invite. */
export const FleetSuggestion = z.object({ name: z.string(), phone: z.string() });
export type FleetSuggestion = z.infer<typeof FleetSuggestion>;

/**
 * `GET /merchant/fleet` (owner and staff): the Own bikers roster (OB-M1–M5). `enabled: false` = this business has
 * no Own bikers (the Account row is removed; everything else empty). Staff get no invites' links, no suggestions
 * and masked numbers (E6).
 */
export const OwnerFleetResponse = z.object({
  enabled: z.boolean(),
  paused: z.boolean(),
  role: z.enum(["owner", "staff"]),
  bikers: z.array(FleetBikerRow),
  invites: z.array(FleetInviteRow),
  suggestions: z.array(FleetSuggestion),
});
export type OwnerFleetResponse = z.infer<typeof OwnerFleetResponse>;

/** `POST /fleet/invites/open` (biker app, from the link): the code in the link. */
export const OpenFleetInviteRequest = z.object({ code: z.string().trim().min(4).max(32) }).strict();
export type OpenFleetInviteRequest = z.infer<typeof OpenFleetInviteRequest>;

/**
 * An invite to the signed-in biker's number (OB-R1/OB-R2). `canJoin` is false until their ID check passes (the
 * muted "finish your ID check to join" card).
 */
export const MyFleetInvite = z.object({
  id: z.string().uuid(),
  shop: z.string(),
  canJoin: z.boolean(),
  expiresAt: z.string().datetime(),
});
export type MyFleetInvite = z.infer<typeof MyFleetInvite>;

/** `GET /fleet/me` (biker app): the fleet this biker rides for, if any, and any invites to their number. */
export const MyFleetResponse = z.object({
  fleet: z
    .object({
      /** The biker's home branch, the name every fleet screen uses (owner decision P7-1). */
      shop: z.string(),
      paused: z.boolean(),
      joinedAt: z.string().datetime(),
    })
    .nullable(),
  invites: z.array(MyFleetInvite),
});
export type MyFleetResponse = z.infer<typeof MyFleetResponse>;

/** Join refusals (OB-R3), as `reason` on the 403/409 body. */
/** One row of a fleet biker's Money (OB-R10): cash collected at a door ("Collected · #B204 +$14.00") or handed back to
 *  the counter ("Returned to Chicken Inn −$9.50"). None of it is the biker's, so the app draws it in ink. */
export const FleetMoneyLine = z.object({
  kind: z.enum(["collected", "returned"]),
  /** "#B204" (`orderShortId`). */
  ref: z.string(),
  amount: z.string(),
  at: z.string().datetime(),
});
export type FleetMoneyLine = z.infer<typeof FleetMoneyLine>;

/** `GET /fleet/money` (OB-R10): the cash the biker holds for the business now, and its recent movements, newest first. */
export const FleetMoneyResponse = z.object({
  shop: z.string(),
  cashHeld: z.string(),
  lines: z.array(FleetMoneyLine),
});
export type FleetMoneyResponse = z.infer<typeof FleetMoneyResponse>;

export const FleetJoinRefusal = z.enum(["id_check_pending", "works_at_shop", "in_another_fleet", "invite_ended", "on_a_job"]);
export type FleetJoinRefusal = z.infer<typeof FleetJoinRefusal>;

/**
 * How a "My bikers" booking rings (OB-M9/M10, `m.noneTookB`: "We rang them 3 times over 2 minutes."). Each round
 * rings every online, free Own biker of the owner at once, nearest first; the first to accept takes it.
 */
export const FLEET_DISPATCH = {
  rounds: 3,
  roundMs: 40_000,
  /** How often the server looks for bookings due a round (a round's end, or a biker's drop). */
  sweepIntervalMs: 10_000,
  /** The most bikers one round rings (a guard on the fan-out, not a product limit). */
  maxRung: 50,
  /** E8: a booking left waiting on the business ("None of your bikers took it") this long ends as `expired`. */
  holdExpireMs: 30 * 60_000,
} as const;

/**
 * `POST /merchant/fleet/bookings` (OB-M8 "Ring my bikers"): Book a biker for the business's own bikers. Same form
 * as Any biker, minus the fare: an Own biker carries no fare (LyniaGo bills the business per ride).
 */
export const CreateFleetBookingRequest = CreateMerchantBookingRequest.omit({ proposedFare: true });
export type CreateFleetBookingRequest = z.infer<typeof CreateFleetBookingRequest>;

/**
 * `POST /merchant/fleet/bookings`: the booking, and its delivery code shown ONCE (as Any biker's pick). A "My
 * bikers" booking has its code from the start, so the business can send it to the buyer while it rings.
 */
export const CreateFleetBookingResponse = z.object({ booking: MerchantBookingResponse, deliveryCode: z.string() });
export type CreateFleetBookingResponse = z.infer<typeof CreateFleetBookingResponse>;

/** `POST /merchant/fleet/bookings/:id/any-biker` (OB-M10/M11 "Send to any biker"): the fare for the public auction. */
export const ConvertFleetBookingRequest = z.object({ proposedFare: FareUsd }).strict();
export type ConvertFleetBookingRequest = z.infer<typeof ConvertFleetBookingRequest>;

/**
 * An Own biker's live job offer (OB-R5 "New Chicken Inn job"): the `fleet:offer` socket event and each row of
 * `GET /fleet/jobs/offers`. No fare: the biker is paid by the business. `collect` is the cash the buyer pays at
 * the door, which the biker brings back (null when there is none).
 */
export const FleetJobOffer = z.object({
  orderId: z.string().uuid(),
  shop: z.string(),
  pickup: PublicWaypoint,
  dropoff: PublicWaypoint,
  itemsSummary: z.string(),
  collect: z.string().nullable(),
  distanceKm: z.number().nullable(),
  expiresAt: z.string().datetime(),
  /** T9: `booking` = a "My bikers" booking (accept at `/fleet/jobs`); `app` = one of the business's own app orders
   *  (restaurant, shop or pharmacy), rung to its Own bikers first. Absent = `booking`. Both accept at `/fleet/jobs`. */
  kind: z.enum(["booking", "app"]).optional(),
});
export type FleetJobOffer = z.infer<typeof FleetJobOffer>;

/** `GET /fleet/jobs/offers`: the biker's live offers, the one running out first first. */
export const FleetJobOffersResponse = z.object({ offers: z.array(FleetJobOffer) });
export type FleetJobOffersResponse = z.infer<typeof FleetJobOffersResponse>;

// ── Own bikers: the admin console (handoff own-bikers-v1 OB-A1–A4, T7) ────────────────────────────────────────

/** OB-A3: why ops paused or disabled a fleet (the kit's reason-code pattern; the note goes on the audit row). */
export const FLEET_ADMIN_REASON_CODES = ["NON_PAYMENT", "MERCHANT_REQUEST", "ABUSE_REPORT", "OTHER"] as const;
export const FleetAdminReasonCode = z.enum(FLEET_ADMIN_REASON_CODES);
export type FleetAdminReasonCode = z.infer<typeof FleetAdminReasonCode>;

/** A weekly fleet bill's state: `unpaid` (not yet due), `overdue` (past its Friday), `paid`. */
export const FleetBillState = z.enum(["unpaid", "overdue", "paid"]);
export type FleetBillState = z.infer<typeof FleetBillState>;

/** OB-A1 status column: the worst of the fleet's state and its bills. */
export const AdminFleetStatus = z.enum(["paused", "disabled", "overdue", "unpaid", "paid"]);
export type AdminFleetStatus = z.infer<typeof AdminFleetStatus>;

/** `GET /admin/fleets`: one row per owner (OB-A1: Owner · Branches · Bikers · This week · Unpaid · Days overdue · Status). */
export const AdminFleetRow = z.object({
  ownerProfileId: z.string().uuid(),
  owner: z.string(),
  branches: z.number().int(),
  bikers: z.number().int(),
  thisWeek: z.string(),
  unpaid: z.string(),
  daysOverdue: z.number().int(),
  status: AdminFleetStatus,
  rideFee: z.string().nullable(),
  /** OB-A1 "Branches": the branches' names, A–Z. Older APIs leave it out. */
  branchNames: z.array(z.string()).optional(),
  /** The fleet's bikers online now (on a job included). Older APIs leave it out. */
  online: z.number().int().optional(),
});
export type AdminFleetRow = z.infer<typeof AdminFleetRow>;

/** One billed ride the console can correct (OB-A2 Adjust "Which ride": "#B190 · Tendai · 4 Oct 10:05"). */
export const AdminFleetRide = z.object({
  orderId: z.string().uuid(),
  ref: z.string(),
  merchantId: z.string().uuid(),
  biker: z.string().nullable(),
  at: z.string().datetime(),
  fee: z.string(),
});
export type AdminFleetRide = z.infer<typeof AdminFleetRide>;

/** One closed week's bill, with a line per branch (E7). Dates are Harare calendar days. */
export const AdminFleetBill = z.object({
  id: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  dueOn: z.string().nullable(),
  total: z.string(),
  state: FleetBillState,
  daysOverdue: z.number().int(),
  paidAt: z.string().datetime().nullable(),
  branches: z.array(z.object({ merchantId: z.string().uuid(), name: z.string(), rides: z.number().int(), total: z.string() })),
});
export type AdminFleetBill = z.infer<typeof AdminFleetBill>;

/** `GET /admin/fleets/:ownerId` (OB-A2 side panel). */
export const AdminFleetDetail = z.object({
  ownerProfileId: z.string().uuid(),
  owner: z.string(),
  phone: z.string().nullable(),
  enabled: z.boolean(),
  paused: z.boolean(),
  rideFee: z.string().nullable(),
  branches: z.array(z.object({ merchantId: z.string().uuid(), name: z.string() })),
  bikers: z.array(z.object({ riderId: z.string().uuid(), name: z.string(), homeBranch: z.string(), state: FleetBikerState })),
  /** The open week so far: rides and total, adjustments included. */
  thisWeek: z.object({ rides: z.number().int(), total: z.string() }),
  bills: z.array(AdminFleetBill),
  /** The last 5 weeks' billed rides, newest first (at most 100): what Adjust can correct. Older APIs leave it out. */
  recentRides: z.array(AdminFleetRide).optional(),
  /** What a ride is billed at (owner, 2026-10-20): this % of its cost, the commission rate. Older APIs leave it out. */
  feePct: z.number().min(0).max(100).optional(),
});
export type AdminFleetDetail = z.infer<typeof AdminFleetDetail>;

/** The merchant app's name for a weekly bill (the same shape the console shows). */
export const FleetBill = AdminFleetBill;
export type FleetBill = AdminFleetBill;

/** One row of a branch's fleet rides (OB-M13 "FLEET RIDES"): a ride's fee, or a correction ("Credit · #B190 · wrong fee"). */
export const FleetRideLine = z.object({
  orderId: z.string().uuid().nullable(),
  /** "#B204" (`orderShortId`); null for a correction not tied to a ride. */
  ref: z.string().nullable(),
  at: z.string().datetime(),
  kind: z.enum(["booking", "marketplace", "adjustment"]),
  fee: z.string(),
  reason: z.string().nullable(),
  /** The Own biker's first name ("#B204 · Tendai · 12:40"); null on a correction. Older APIs leave it out. */
  biker: z.string().nullable().optional(),
});
export type FleetRideLine = z.infer<typeof FleetRideLine>;

/** `GET /merchant/fleet/rides` (owner and staff, OB-M13): the branch's fleet rides for one Harare week (Mon–Sun).
 *  `rides` counts billed rides: one credited back to nothing that week doesn't count. */
export const FleetRidesResponse = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  rides: z.number().int(),
  total: z.string(),
  lines: z.array(FleetRideLine),
});
export type FleetRidesResponse = z.infer<typeof FleetRidesResponse>;

/** `GET /merchant/fleet/bills` (owner only, OB-M14): this week so far across branches, and the closed weekly bills. */
export const FleetBillsResponse = z.object({
  thisWeek: z.object({
    rides: z.number().int(),
    total: z.string(),
    /** OB-M14's branch lines ("Avondale · 15 rides · $22.50"): the branches with rides or corrections this week. */
    branches: z.array(z.object({ merchantId: z.string().uuid(), name: z.string(), rides: z.number().int(), total: z.string() })).optional(),
  }),
  bills: z.array(AdminFleetBill),
});
export type FleetBillsResponse = z.infer<typeof FleetBillsResponse>;

/**
 * `POST /admin/merchants/:id/fleet`: turn Own bikers back on for the branch's owner after a Disable. Every business
 * has it by default and pays the commission rate on each ride (owner, 2026-10-20), so there is no fee to set;
 * `rideFee`, which older consoles send, is ignored.
 */
export const EnableFleetRequest = z.object({ rideFee: z.number().positive().max(100).multipleOf(0.01).optional(), note: z.string().trim().max(2000).optional() }).strict();
export type EnableFleetRequest = z.infer<typeof EnableFleetRequest>;

/** @deprecated The flat per-ride fee is retired (owner, 2026-10-20); `POST /admin/fleets/:ownerId/fee` is gone. */
export const SetFleetFeeRequest = z.object({ rideFee: z.number().positive().max(100).multipleOf(0.01), note: z.string().trim().min(3).max(2000) }).strict();
export type SetFleetFeeRequest = z.infer<typeof SetFleetFeeRequest>;

/** `POST /admin/fleets/:ownerId/{pause,unpause,disable}` (OB-A3): a reason code, and a note for the audit row. */
export const FleetAdminActionRequest = z.object({ reasonCode: FleetAdminReasonCode, note: z.string().trim().max(2000).optional() }).strict();
export type FleetAdminActionRequest = z.infer<typeof FleetAdminActionRequest>;

/** `POST /admin/fleets/:ownerId/adjust` (OB-A2 "Adjust"): a correction on the open week, usually negative. */
export const FleetAdjustRequest = z
  .object({
    merchantId: z.string().uuid(),
    amount: z.number().min(-1000).max(1000).multipleOf(0.01),
    reason: z.string().trim().min(3).max(500),
    orderId: z.string().uuid().optional(),
  })
  .strict();
export type FleetAdjustRequest = z.infer<typeof FleetAdjustRequest>;

/** `POST /admin/fleets/bills/:id/paid` (OB-A2 "Mark paid"). */
export const MarkFleetBillPaidRequest = z.object({ note: z.string().trim().max(2000).optional() }).strict();
export type MarkFleetBillPaidRequest = z.infer<typeof MarkFleetBillPaidRequest>;

/** `fleet:offer-closed`: the offer stopped being live (taken, declined, ran out, cancelled or sent to any biker). */
export const FleetOfferClosedEvent = z.object({ orderId: z.string().uuid(), at: z.string() });
export type FleetOfferClosedEvent = z.infer<typeof FleetOfferClosedEvent>;

/** `POST /admin/merchants/:id/owner`: support hands a business to another person after an identity check. */
export const TransferMerchantOwnerRequest = z
  .object({
    phone: z.string().trim().min(6).max(20),
    note: z.string().trim().min(10).max(500),
  })
  .strict();
export type TransferMerchantOwnerRequest = z.infer<typeof TransferMerchantOwnerRequest>;

/* ── Merchant v2 (ledger D-77): the offline-rider hand-over fallback ("Rider can't enter code") ──────────
 * The merchant gets a short-lived signed link for the assigned rider and sends it from their own phone.
 * The rider opens it in a browser and types the same 6-digit pickup code the merchant reads out, so the
 * code check is unchanged; only the app is skipped. The link dies at its expiry, at pickup, and whenever
 * the pickup code is re-minted. Behind the merchant web's NEXT_PUBLIC_MERCHANT_HANDOVER_FALLBACK (off). */

/** `POST /merchant/orders/:orderId/handover-fallback` (merchant). */
export const HandoverFallbackResponse = z
  .object({
    /** The link to send the rider: `<merchant web>/h/<token>`. */
    link: z.string().url(),
    expiresAt: z.string(),
    /** The rider's number, to send the link to (null when unknown). */
    riderPhone: z.string().nullable(),
  })
  .strict();
export type HandoverFallbackResponse = z.infer<typeof HandoverFallbackResponse>;

/** `GET /handover/:token` (public): what the rider's page shows before the code is typed. */
export const HandoverLinkInfoResponse = z
  .object({
    orderLabel: z.string(),
    venueName: z.string(),
    expiresAt: z.string(),
  })
  .strict();
export type HandoverLinkInfoResponse = z.infer<typeof HandoverLinkInfoResponse>;

/** `POST /handover/:token/confirm` (public): the pickup code the merchant reads out. */
export const HandoverLinkConfirmRequest = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export type HandoverLinkConfirmRequest = z.infer<typeof HandoverLinkConfirmRequest>;
