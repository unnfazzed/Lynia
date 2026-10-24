/**
 * Contracts: the merchant domain and menu (Restaurants C1). Re-exported by ../contracts.ts (the front door).
 */
import { z } from "zod";
import { LatLng, UploadObjectKey, Waypoint } from "./core";
import { MERCHANT_APPLICATION_STATUSES } from "../merchant-application";

// ---------------------------------------------------------------------------
// Restaurants vertical — merchant domain + menu (C1,
// docs/archive/plans/2026-07-28-restaurants-send-joint-launch-plan.md §5 Lane C)
// ---------------------------------------------------------------------------
// Everything here is dormant until RESTAURANTS_ENABLED=true AND (for the customer read API) the
// merchant's own `pilotEnabled` cohort flag is set — the pre-launch allowlist corridor. Money/pricing
// (delivery fee, min order) is deliberately NOT here yet — that lands with C2's order lifecycle.

/** R-03: the merchant's own cash-handling rule, shown to a rider on the offer before they accept. */
export const MerchantCashRule = z.enum(["collect_and_return", "pay_upfront"]);
export type MerchantCashRule = z.infer<typeof MerchantCashRule>;

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** One day's open/close window, "HH:MM" 24h. Both present or the day is treated as closed. */
export const MerchantHoursWindow = z.object({ open: z.string().regex(HHMM), close: z.string().regex(HHMM) }).strict();
export type MerchantHoursWindow = z.infer<typeof MerchantHoursWindow>;
/** Weekly hours keyed by day; an absent day means closed that day. `partialRecord`, not `record`: in
 *  Zod 4 an enum-keyed `record` requires every key, which refused any week with a closed day
 *  (E2E 2026-10-05 LB-2). */
export const MerchantHours = z.partialRecord(z.enum(DAY_KEYS), MerchantHoursWindow);
export type MerchantHours = z.infer<typeof MerchantHours>;

/** Merchant web upgrade L1 (docs/archive/plans/2026-09-29-merchant-web-upgrade-plan.md): what a business sells,
 *  chosen once at sign-up. There is no endpoint that changes it — a wrong pick is a support fix. */
export const MerchantBusinessType = z.enum(["restaurant", "shop"]);
export type MerchantBusinessType = z.infer<typeof MerchantBusinessType>;

/** A shop's kind: the website's "We deliver for" list plus the owner's examples. */
export const MerchantShopKind = z.enum(["pharmacy", "grocery", "butchery", "fashion", "auto_parts", "hardware", "electronics", "other"]);
export type MerchantShopKind = z.infer<typeof MerchantShopKind>;

/** What a shopkeeper calls each kind — the design doc's words and order (merchant web upgrade L1.4), shared
 *  so the sign-up and the admin console never name a kind two ways. */
export const MERCHANT_SHOP_KIND_LABELS: Readonly<Record<MerchantShopKind, string>> = {
  pharmacy: "Pharmacy",
  grocery: "Grocery",
  butchery: "Butchery",
  fashion: "Clothes & shoes",
  auto_parts: "Car parts",
  hardware: "Hardware",
  electronics: "Phones & electronics",
  other: "Something else",
};

/** Two roles, not a permissions matrix (design doc L4's permission table). */
export const MerchantMemberRole = z.enum(["owner", "staff"]);
export type MerchantMemberRole = z.infer<typeof MerchantMemberRole>;

/** A business's own location as the merchant sends it (merchant mobile redesign, ledger D-48): the point
 *  from GPS or an address search, the address line that search or reverse-geocode gave, and the contact
 *  phone. The landmark is optional — the redesign dropped the field. The API stores a full `Waypoint`
 *  (see `merchantWaypoint`), so every rider-facing read still gets a non-empty landmark. */
export const MerchantLocationInput = z
  .object({
    point: LatLng,
    landmark: z.string().trim().min(1).max(160).optional(),
    address: z.string().trim().min(1).max(200).optional(),
    contactPhone: z.string().min(6).max(20),
  });
export type MerchantLocationInput = z.infer<typeof MerchantLocationInput>;

/** The stored `Waypoint` for a merchant location: the landmark if one was given, else the address line,
 *  else the business's name — never empty, because riders read it at every pickup. */
export function merchantWaypoint(input: MerchantLocationInput, businessName: string): Waypoint {
  const landmark = (input.landmark ?? input.address ?? businessName).trim().slice(0, 160) || businessName.slice(0, 160);
  return { point: input.point, landmark, contactPhone: input.contactPhone };
}

/** `POST /merchant/become` — self-serve sign-up (L1). Creates the Merchant and the caller's OWNER
 *  membership in one transaction; it never touches `profiles.role` (RCA 2026-08-18 C-4). The business
 *  starts dormant — go-live (`pilotEnabled`) is an ops switch, restaurants only. A second call 409s
 *  `{reason:"already_member"}`, which the web treats as success (a lost-response retry). */
export const BecomeMerchantRequest = z
  .object({
    /** The person's own name ("Your name"). Saved to their profile only when it is still empty. */
    ownerName: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(120),
    businessType: MerchantBusinessType,
    /** Refused for a restaurant. Optional for a shop since the mobile redesign (D-48): its "What do you
     *  sell?" asks only restaurant or shop, and a shop without a kind is stored as `other`. */
    shopKind: MerchantShopKind.optional(),
    /** Where the business is: GPS or search, the contact phone, and optionally a landmark (D-48). */
    location: MerchantLocationInput,
    /** The one-tap "I accept the merchant terms and privacy notice" line. */
    termsAccepted: z.literal(true),
    cashRule: MerchantCashRule.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.businessType === "restaurant" && v.shopKind !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["shopKind"], message: "Only a shop has a kind." });
    }
  });
export type BecomeMerchantRequest = z.infer<typeof BecomeMerchantRequest>;

/** D-30 shop-front fields, editable by the merchant against a live customer-view miniature. A key left
 *  out stays as it is; `null` clears it (shop-front-v1, D-115: Remove photo, and tapping the selected price
 *  level again). */
export const UpdateMerchantProfileRequest = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    coverPhotoUrl: UploadObjectKey.nullable().optional(),
    logoUrl: UploadObjectKey.nullable().optional(),
    cuisineTags: z.array(z.string().trim().min(1).max(24)).max(3).optional(),
    priceLevel: z.number().int().min(1).max(3).nullable().optional(),
  })
  .strict();
export type UpdateMerchantProfileRequest = z.infer<typeof UpdateMerchantProfileRequest>;

/** `POST /admin/merchants/:id/shop-front` (ops setting up a business on its behalf): the same fields as the
 *  owner's `PATCH /merchant/profile`, plus the reason the audit row needs. A photo key here must be one
 *  `POST /admin/merchants/:id/shop-front/photo` minted for THIS business. */
export const AdminUpdateShopFrontRequest = UpdateMerchantProfileRequest.extend({
  reasonCode: z.string().trim().min(1).max(120),
  note: z.string().trim().max(2000).optional(),
}).refine(
  (v) => [v.name, v.description, v.coverPhotoUrl, v.logoUrl, v.cuisineTags, v.priceLevel].some((f) => f !== undefined),
  { message: "Nothing to change" },
);
export type AdminUpdateShopFrontRequest = z.infer<typeof AdminUpdateShopFrontRequest>;

/** `POST /admin/merchants/:id/shop-front/photo`: a signed PUT for a logo or cover ops uploads for a business. */
export const AdminShopFrontPhotoRequest = z.object({ contentType: z.enum(["image/jpeg", "image/png"]) }).strict();
export type AdminShopFrontPhotoRequest = z.infer<typeof AdminShopFrontPhotoRequest>;

export const UpdateMerchantHoursRequest = z.object({ hours: MerchantHours }).strict();
export type UpdateMerchantHoursRequest = z.infer<typeof UpdateMerchantHoursRequest>;

export const UpdateMerchantCashRuleRequest = z.object({ cashRule: MerchantCashRule }).strict();
export type UpdateMerchantCashRuleRequest = z.infer<typeof UpdateMerchantCashRuleRequest>;

/** N-17: busy mode is a manual on/off the merchant flips from the kitchen board's empty-queue state —
 *  a +10min prep-time bump signal while true. No auto-expiry; the merchant flips it back off. */
export const SetMerchantBusyModeRequest = z.object({ active: z.boolean() }).strict();
export type SetMerchantBusyModeRequest = z.infer<typeof SetMerchantBusyModeRequest>;

/** `PATCH /merchant/order-settings` (owner) and `PATCH /admin/merchants/:id/order-settings` (ops):
 *  how the restaurant takes orders. Both fields optional; at least one must be sent. */
export const UpdateMerchantOrderSettingsRequest = z
  .object({ autoAccept: z.boolean().optional(), showPhoneToCustomers: z.boolean().optional(), freeDelivery: z.boolean().optional() })
  .strict()
  .refine((v) => v.autoAccept !== undefined || v.showPhoneToCustomers !== undefined || v.freeDelivery !== undefined, {
    message: "Nothing to change",
  });
export type UpdateMerchantOrderSettingsRequest = z.infer<typeof UpdateMerchantOrderSettingsRequest>;

/** Change an order's items after placement (agreed with the customer by phone): the new quantity per
 *  line, 0 removes it. Optional new prep time. At least one line must stay. */
export const EditMerchantOrderItemsRequest = z
  .object({
    lines: z
      .array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(0).max(99) }).strict())
      .min(1)
      .max(30),
    prepMinutes: z.number().int().min(5).max(120).optional(),
    /** The quantities the editor was showing (0 = taken off). When sent, the edit is refused if the order's
     *  lines no longer match, so a stale screen can't overwrite a change made since it loaded. Optional. */
    expected: z
      .array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(0).max(99) }).strict())
      .max(30)
      .optional(),
  })
  .strict();
export type EditMerchantOrderItemsRequest = z.infer<typeof EditMerchantOrderItemsRequest>;

/** `POST /merchant/orders/:id/collected` — the rider's no-code pickup at an auto-accept restaurant.
 *  Accepted only within RESTAURANTS_AUTO_ACCEPT.pickupGeofenceM of the restaurant. */
export const ConfirmCollectedRequest = z.object({ point: LatLng }).strict();
export type ConfirmCollectedRequest = z.infer<typeof ConfirmCollectedRequest>;

/** `PATCH /merchant/open` — the Orders header's open/closed switch (merchant mobile B1/B5, D-48).
 *  Closing holds until the next day starts or the merchant opens again; opening clears it. */
export const SetMerchantOpenRequest = z.object({ open: z.boolean() }).strict();
export type SetMerchantOpenRequest = z.infer<typeof SetMerchantOpenRequest>;

/** `GET/PATCH /merchant/me` response — the authenticated merchant's own view of their shop. */
export const MerchantProfileResponse = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    ownerPhoneMasked: z.string(),
    description: z.string().nullable(),
    coverPhotoUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    cuisineTags: z.array(z.string()),
    priceLevel: z.number().int().nullable(),
    hours: MerchantHours.nullable(),
    cashRule: MerchantCashRule,
    busy: z.boolean(),
    pilotEnabled: z.boolean(),
    /** L1: what the business sells; drives the web's vocabulary, nav and `/setup` checklist. */
    businessType: MerchantBusinessType,
    shopKind: MerchantShopKind.nullable(),
    /** L1: the CALLER's role on this business (the web hides owner-only sections for staff). */
    myRole: MerchantMemberRole,
    /** L2: the business's pin, landmark and contact phone — every booking's pickup, and the booking
     *  form's map centre and fare quote. Null until the business has a pin; absent from an API older
     *  than L2 (optional, so the change stays additive). */
    location: Waypoint.nullable().optional(),
    /** L4: the CALLER's name on this business's team, for the top bar ("Tendai · Staff"). Absent from an
     *  API older than L4 (optional, so the change stays additive). */
    myName: z.string().optional(),
    /** D-48: closed by hand until this time (ISO); absent or null = open by hours. */
    closedUntil: z.string().nullable().optional(),
    /** Auto-accept: new orders skip the accept window (optional, so older APIs stay valid). */
    autoAccept: z.boolean().optional(),
    /** The restaurant agreed to show its phone number to customers with a live order. */
    showPhoneToCustomers: z.boolean().optional(),
    /** D-71: the venue pays the delivery fee on new cash orders (customers pay $0 delivery). */
    freeDelivery: z.boolean().optional(),
    /** Order flow v2 (BRIEF §13): the CALLER may approve or decline prescriptions. Optional/additive. */
    myIsPharmacist: z.boolean().optional(),
    /** Admin console v2 §5: where the business is in its application, and the reject reason code
     *  (MERCHANT_REJECT_REASON_LABELS) while it is rejected. Optional, so older APIs stay valid. */
    application: z
      .object({ status: z.enum(MERCHANT_APPLICATION_STATUSES), reasonCode: z.string().nullable() })
      .optional(),
  })
  .strict();
export type MerchantProfileResponse = z.infer<typeof MerchantProfileResponse>;

/** D-29: categories are merchant-created; name + optional time-limited availability window. */
export const MerchantCategoryRequest = z
  .object({
    name: z.string().trim().min(1).max(60),
    availableFrom: z.string().regex(HHMM).optional(),
    availableTo: z.string().regex(HHMM).optional(),
  })
  .strict();
export type MerchantCategoryRequest = z.infer<typeof MerchantCategoryRequest>;

/** PATCH-only fields on an existing category — all optional (mirrors CreateOrderRequest-style partials
 *  elsewhere), plus `hidden`/`sortOrder` which only ever change post-creation. */
export const UpdateMerchantCategoryRequest = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    availableFrom: z.string().regex(HHMM).nullable().optional(),
    availableTo: z.string().regex(HHMM).nullable().optional(),
    hidden: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();
export type UpdateMerchantCategoryRequest = z.infer<typeof UpdateMerchantCategoryRequest>;

export const MerchantCategoryResponse = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    sortOrder: z.number().int(),
    availableFrom: z.string().nullable(),
    availableTo: z.string().nullable(),
    hidden: z.boolean(),
    dishCount: z.number().int(),
  })
  .strict();
export type MerchantCategoryResponse = z.infer<typeof MerchantCategoryResponse>;

/** D-31: a dish saved with no `photoUrl` persists as a draft (server sets `isDraft`, never the
 *  client) — visible to the kitchen, excluded from the customer read API until a photo lands. */
export const MerchantDishRequest = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).optional(),
    priceUsd: z.number().positive().multipleOf(0.01).max(1000),
    photoUrl: UploadObjectKey.optional(),
    /** Order flow v2 (BRIEF §13): "Prescription needed". Pharmacies only; default false. */
    rxRequired: z.boolean().optional(),
  })
  .strict();
export type MerchantDishRequest = z.infer<typeof MerchantDishRequest>;

export const UpdateMerchantDishRequest = z
  .object({
    categoryId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    priceUsd: z.number().positive().multipleOf(0.01).max(1000).optional(),
    photoUrl: UploadObjectKey.optional(),
    sortOrder: z.number().int().min(0).optional(),
    /** Order flow v2 (BRIEF §13): "Prescription needed". Pharmacies only. */
    rxRequired: z.boolean().optional(),
  })
  .strict();
export type UpdateMerchantDishRequest = z.infer<typeof UpdateMerchantDishRequest>;

/** How long a dish stays out of stock (`RM.oos_sheet`, merchant web upgrade L5): until the kitchen turns it
 *  back on, the rest of today (the default, N-14's always-safe choice) or one hour. */
export const DishOutOfStockFor = z.enum(["until_back", "rest_of_today", "one_hour"]);
export type DishOutOfStockFor = z.infer<typeof DishOutOfStockFor>;

/** `POST /merchant/dishes/:id/out-of-stock`. The body is optional: none means the rest of today. */
export const SetDishOutOfStockRequest = z.object({ for: DishOutOfStockFor.optional() }).strict();
export type SetDishOutOfStockRequest = z.infer<typeof SetDishOutOfStockRequest>;

export const MerchantDishResponse = z
  .object({
    id: z.string().uuid(),
    categoryId: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    priceUsd: z.number(),
    photoUrl: z.string().nullable(),
    /** D7 (2026-10-07): a signed URL of the photo's small variant (shorter side 400 px), for list rows,
     *  tiles and thumbnails; the full `photoUrl` stays for the large views. Absent until the thumb exists
     *  (and from older servers): use `thumbUrl ?? photoUrl`. */
    thumbUrl: z.string().optional(),
    isDraft: z.boolean(),
    outOfStock: z.boolean(),
    /** D-48 C1: when an off dish comes back on its own (ISO). Absent on older servers; null when on.
     *  Year 9999 means "until I turn it back on". */
    outOfStockUntil: z.string().nullable().optional(),
    sortOrder: z.number().int(),
    /** Order flow v2 (BRIEF §13): "Prescription needed". Absent on older servers. */
    rxRequired: z.boolean().optional(),
  })
  .strict();
export type MerchantDishResponse = z.infer<typeof MerchantDishResponse>;
