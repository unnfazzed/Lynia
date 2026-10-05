"use client";

import { useMemo } from "react";
import type { MerchantBusinessType, MerchantShopKind } from "@lynia/shared";
import { useBusiness } from "./business";
import { STARTER_CATEGORY_NAMES } from "./menu-groups";

/**
 * The words that differ between a restaurant and a shop (merchant web upgrade plan D6): a plain typed
 * map, not an i18n framework. Every noun a shop sees differently comes from here, so a screen asks for
 * `v.items` instead of writing "dishes". A restaurant's words are the drawn RM copy, word for word; a
 * shop's are ledgered in docs/DESIGN-DEVIATIONS.md D-44 (L2 covers the screens a shop uses: Items and
 * Shop; L5 finishes the rest).
 */
export interface Vocabulary {
  /** The catalogue's nav label and screen title, and the same in a sentence ("Loading your menu…"). */
  catalog: string;
  catalogLower: string;
  /** What the business sells, one and many: "dish" / "dishes", "item" / "items". */
  item: string;
  items: string;
  /** With its article: "a dish", "an item". */
  anItem: string;
  /** Where customers see the categories as tabs: "your menu" / "on your menu", "your shop" / "in your shop". */
  storefront: string;
  onStorefront: string;
  /** The categories screen's way back to the catalogue. */
  backToCatalog: string;
  /** The empty catalogue's one-line explainer, under "Start with a category". */
  emptyCatalogHint: string;
  /** The new-category sheet's sub-line. */
  categoryNameHint: string;
  /** The shop profile's tag label: "What you cook", "What you sell". */
  whatYouOffer: string;
  /** The first-run chips on an empty catalogue: one-tap category names. */
  starterCategories: readonly string[];
  /** The banner photo advice on the profile and the crop sheet. */
  bannerPhotoTip: string;
  /** The Shop profile's sub-line: when its changes reach customers. */
  profileSub: string;
  /** The editor's note under the item photo slot. */
  itemPhotoNote: string;
  /** The item photo crop sheet: its sub-line, the preview's label and sub-line. */
  itemCropSub: string;
  itemPreviewLabel: string;
  itemPreviewSub: string;
  /** Order flow v2 (ledger D-59, the handoff's `O.svc`): the second step of the order's track and the
   *  ticket's stage word (`making`), the ticket's primary (`ready`), the four-step track (`st`) and the
   *  goods-back button (`back`). A pharmacy speaks the shop's words. */
  making: string;
  readyCta: string;
  track: readonly [string, string, string, string];
  goodsBack: string;
}

const RESTAURANT: Vocabulary = {
  catalog: "Menu",
  catalogLower: "menu",
  item: "dish",
  items: "dishes",
  anItem: "a dish",
  storefront: "your menu",
  onStorefront: "on your menu",
  backToCatalog: "Back to the menu",
  emptyCatalogHint: "Dishes live inside categories — Mains, Sides, Drinks, whatever fits your kitchen. Create one and you can add dishes straight into it.",
  categoryNameHint: "Customers see this name as a tab on your menu. Keep it short — “Breakfast”, “Combos”, “Kids”.",
  whatYouOffer: "What you cook",
  starterCategories: STARTER_CATEGORY_NAMES,
  bannerPhotoTip: "A real photo of your food beats a logo on the banner. Shoot in daylight, no flash — and keep the left edge clear, your logo sits there.",
  profileSub: "This is your shop front. Changes go live straight away.",
  itemPhotoNote:
    "Every dish needs one photo before it goes live — dishes with photos are ordered about twice as often. Pick the file from this phone; we shrink it for you.",
  itemCropSub: "Square crop. Fill the frame with the food, not the table.",
  itemPreviewLabel: "HOW IT LOOKS ON THE MENU",
  itemPreviewSub: "How the photo reads at menu size",
  making: "Cooking", // O.svc.food.making
  readyCta: "Food is ready", // O.svc.food.ready
  track: ["Confirmed", "Cooking", "On the way", "Delivered"], // O.svc.food.st
  goodsBack: "I got the food back", // O.svc.food.back
};

/** Starting points per kind of shop: the aisles such a shop already has. Pharmacies get over-the-counter
 *  groups only, since prescription items stay out until regulators sign off (plan 2026-07-26 §6 P6). */
const SHOP_STARTERS: Readonly<Record<MerchantShopKind, readonly string[]>> = {
  pharmacy: ["Pain relief", "Cold & flu", "Vitamins", "Personal care"],
  grocery: ["Groceries", "Drinks", "Household", "Snacks"],
  butchery: ["Beef", "Chicken", "Pork", "Braai packs"],
  fashion: ["Women", "Men", "Kids", "Shoes"],
  auto_parts: ["Engine", "Brakes", "Electrical", "Tyres"],
  hardware: ["Building", "Plumbing", "Electrical", "Tools"],
  electronics: ["Phones", "Accessories", "Chargers", "Audio"],
  other: ["Popular", "New in", "Specials", "Other"],
};

function shopVocabulary(kind: MerchantShopKind | null | undefined): Vocabulary {
  const starters = SHOP_STARTERS[kind ?? "other"];
  return {
    catalog: "Inventory", // Merchant v2 (D-77): the tab and screen title
    catalogLower: "items",
    item: "item",
    items: "items",
    anItem: "an item",
    storefront: "your shop",
    onStorefront: "in your shop",
    backToCatalog: "Back to your items",
    emptyCatalogHint: `Items live inside categories — ${starters.slice(0, 3).join(", ")}, whatever fits your shop. Create one and you can add items straight into it.`,
    categoryNameHint: `Customers see this name as a tab in your shop. Keep it short — ${starters
      .slice(0, 3)
      .map((n) => `“${n}”`)
      .join(", ")}.`,
    whatYouOffer: "What you sell",
    starterCategories: starters,
    bannerPhotoTip: "A real photo of your shop beats a logo on the banner. Shoot in daylight, no flash — and keep the left edge clear, your logo sits there.",
    // Customers browse live shops in Shops / Pharmacy (ledger D-58): the restaurant line holds for both.
    profileSub: "This is your shop front. Changes go live straight away.",
    // The restaurant line's "ordered about twice as often" is a claim about dishes; a shop's note keeps the rule only.
    itemPhotoNote: "Every item needs one photo before customers see it. Pick the file from this device; we shrink it for you.",
    itemCropSub: "Square crop. Fill the frame with the item, not the table.",
    itemPreviewLabel: "HOW IT LOOKS IN YOUR SHOP",
    itemPreviewSub: "How the photo reads at list size",
    making: "Packing", // O.svc.shops.making = O.svc.pharmacy.making
    readyCta: "Packed", // Merchant v2 BRIEF §4 (D-77): "Shops see Packed instead"
    track: ["Confirmed", "Packing", "On the way", "Delivered"], // O.svc.shops.st = O.svc.pharmacy.st
    goodsBack: "I got the goods back", // Merchant v2 follow-ups K5c (D-77): "for shops 'I got the goods back'"
  };
}

/**
 * Order flow v2's merchant strings (packages/design/handoff/order-flow-v2/code/copy.ts, ledger D-59),
 * verbatim, keyed as the handoff keys them (`O.m.*`, `O.u.mEdit`, `O.c.view`). `{x}` placeholders are
 * filled by the formatters below. The handoff's sample names (Tendai, Rudo) are the rider / customer;
 * a merchant order carries the rider's name but never the customer's, so no line here names the customer.
 */
export const ORDER_FLOW = {
  newOrder: "NEW ORDER", // O.m.newOrder
  auto: "LyniaGo accepted this for you", // O.m.auto
  autoSub: "Confirm you’re making it so we can send a rider.", // O.m.autoSub
  confirm: "Got it, we’re making it", // O.m.confirm
  decline: "Can’t take it", // O.m.decline
  total: "Order total", // O.m.total
  riderFound: "Rider found 8 min before ready", // O.m.riderFound
  cantFinish: "Can’t finish this order", // O.m.cantFinish
  codeOk: (rider: string) => `${rider} entered the code`, // O.m.codeOk
  code: (rider: string) => `Read this pickup code to ${rider}`, // O.m.code
  handBtn: "Hand over", // O.m.handBtn
  trackT: (id: string) => `${id} on the way`, // O.m.trackT ("#{id} on the way"; the id carries its #)
  cashStep: "Cash back to you", // O.m.cashStep
  cashT: "CASH BACK TO YOU", // O.m.cashT
  cashS: (rider: string, p: string) => `${rider} is bringing ${p}`, // O.m.cashS
  cashDue: (t: string, m: number) => `Due by ${t} · ${m} min left`, // O.m.cashDue
  cashBtn: (p: string) => `I got ${p}`, // O.m.cashBtn
  noCash: "No cash on this one · mark completed", // O.m.noCash
  backT: (rider: string) => `${rider} is bringing the order back`, // O.m.backT
  /** O.m.backS without its first sentence ("Rudo wasn’t at the address."), which names the customer. */
  backS: "Check the bag is still sealed.",
  changeItems: "Change items", // O.u.mEdit
  /** Drawn in of-screens-mrg.js (M1a / M4 / M5 / M6), not keyed in `O`. */
  readyIn: (m: number) => `Ready in ${m} min`,
  handTitle: (id: string) => `Hand over ${id}`,
  cashAfter: "after delivery",
  cashDueAt: (t: string) => `due ${t}`,
  goodsBackT: "GOODS BACK TO YOU",
  goodsDue: (t: string) => `due back by ${t}`,
  delivered: (t: string) => `Delivered ${t}`,
  notDelivered: "Not delivered",

  // ── Round 2: the proposer (U1a/U1b/U4a), the wait (M2), photos (M4b/M5b), Scheduled (M1c/M7), Rx (M8) ──
  // `O.u.m*`, `O.m.*`, `O.c.*` verbatim. The handoff's "Rudo" (the customer) becomes "the customer": a
  // merchant order never carries the customer's name (see the note above).
  mHint: "Tap an item you can’t supply.", // O.u.mHint
  mRemove: "Remove it", // O.u.mRemove
  mSwap: "Swap for…", // O.u.mSwap
  mPick: (i: string) => `Swap ${i} for`, // O.u.mPick
  mSearch: "Search your items", // O.u.mSearch
  mSame: "Same price", // O.u.mSame
  mSend: (n: number) => (n === 1 ? "Send 1 change to customer" : `Send ${n} changes to customer`), // O.u.mSend / O.u.mSendN
  mWait: "Waiting for the customer to answer", // O.u.mWait
  mWaitSub: (making: string) => `Start ${making} the rest — the order goes ahead either way. If the customer doesn’t answer in 3 minutes, swaps are declined.`, // O.u.mWaitSub
  mAsked: "Swap asked", // O.u.mAsked
  mRemoved: "Removing", // O.u.mRemoved
  /** Drawn in of-screens-mrg.js (U1a's bar hint, M2's bar hint, U1b's CTA), not keyed in `O`. */
  mSendHint: (making: string) => `The customer has 3 minutes to answer. You can start ${making}.`,
  mWaitHint: (t: string) => `Waiting for the customer’s answer · ${t}`,
  mSwapTo: (name: string) => `Swap for ${name}`,
  scheduled: "SCHEDULED · START NOW", // O.m.scheduled
  segSched: "Scheduled", // O.m.segSched
  schedRing: (t: string) => `Rings at ${t} like a new order`, // O.m.schedRing
  schedT: (d: string) => `Scheduled for ${d}`, // O.m.schedT
  schedBody: (t: string) => `This order rings at ${t}. Have the items ready to pack by then.`, // O.m.schedBody
  /** M1c's drawn sub-line and CTA (of-screens-mrg.js `M1c`), without the customer's name. */
  schedNow: "The customer expects it in the slot — start now.",
  startCta: (making: string, t: string) => `Start ${making} · ready ${t}`,
  photo: "Sealed bag photo", // O.m.photo
  photoWait: (rider: string) => `Waiting for ${rider}’s photo of the sealed bag`, // O.m.photoWait
  photoReq: "Shops and pharmacies: wait for the photo before you hand over.", // O.m.photoReq
  photoAt: (rider: string, t: string) => `${rider} took this at ${t}`, // O.m.photoAt
  view: "View", // O.c.view
  close: "Close", // O.c.close
  keep: "Keep", // O.c.keep
  doorPhoto: "Delivery photo", // O.p.doorPhoto (M5b's photo row)
  /** M6b's drawn row (of-screens-mrg.js `M6b`). */
  attemptPhoto: "Delivery attempt photo",
  /** M3b's drawn seal reminder (of-screens-mrg.js `M3b`). */
  sealT: "Seal the bag",
  sealS: (rider: string) => ` with a sticker or a stapled receipt. ${rider} photographs it at the counter.`,
  rxT: "Prescription check", // O.m.rxT
  rxPatient: "Patient", // O.m.rxPatient
  rxItems: "Needs a prescription", // O.m.rxItems
  rxConsent: "Customer will show the original to the rider", // O.m.rxConsent
  rxApprove: "Approve prescription", // O.m.rxApprove
  rxDecline: "Decline", // O.m.rxDecline
  rxWhy: "Why are you declining?", // O.m.rxWhy
  rxR: [
    ["unreadable", "Unreadable"],
    ["expired", "Expired"],
    ["not_valid", "Not valid for this medicine"],
    ["other", "Other"],
  ] as const, // O.m.rxR
  rxSend: "Decline and tell the customer", // O.m.rxSend
  rxRest: "The rest of the order carries on unless the customer cancels.", // O.m.rxRest
  /** The Packing ticket's way into M8a (the check's own title, `O.m.rxT`) and the page pill / zoom. */
  rxPage: (n: number, of: number) => `${n} / ${of}`,
  zoom: "Zoom",
} as const;

/** M5b / M6b: the door photo's sub-line — "Left with Chipo at the gate · 12:47" (`O.p.doorPhotoSub`). */
export function doorProofLine(p: { reason: "customer_unreachable" | "handed_to_someone_else" | "left_at_gate" | null; handedTo: string | null }, at: string): string {
  const where =
    p.handedTo && p.reason === "left_at_gate"
      ? `Left with ${p.handedTo} at the gate`
      : p.handedTo
        ? `Left with ${p.handedTo}`
        : p.reason === "left_at_gate"
          ? "Left at the gate"
          : p.reason === "customer_unreachable"
            ? "Customer not reachable"
            : null;
  return [where, at || null].filter(Boolean).join(" · ");
}

/** The words for a business. Restaurants are the default, so a screen that doesn't know yet speaks the
 *  drawn copy rather than guessing. */
export function vocabulary(businessType: MerchantBusinessType | null | undefined, shopKind?: MerchantShopKind | null): Vocabulary {
  return businessType === "shop" ? shopVocabulary(shopKind) : RESTAURANT;
}

/** "1 dish", "3 items". */
export function countOf(n: number, v: Vocabulary): string {
  return `${n} ${n === 1 ? v.item : v.items}`;
}

/** Capitalised, for a sentence or a title: "Dishes", "Item". */
export function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The signed-in business's words, from the shell's shared read (lib/business). Stable between renders,
 *  so it can sit in a hook's dependencies. */
export function useVocabulary(): Vocabulary {
  const business = useBusiness();
  const type = business?.businessType;
  const kind = business?.shopKind;
  return useMemo(() => vocabulary(type, kind), [type, kind]);
}
