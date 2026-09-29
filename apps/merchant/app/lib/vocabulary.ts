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
    "Every dish needs one photo before it goes live — dishes with photos are ordered about twice as often. Pick the file from this tablet; we shrink it for you.",
  itemCropSub: "Square crop. Fill the frame with the food, not the table.",
  itemPreviewLabel: "HOW IT LOOKS ON THE MENU",
  itemPreviewSub: "How the photo reads at menu size",
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
    catalog: "Items",
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
    // Shops aren't listed to customers yet (L1.5), so nothing here goes live straight away.
    profileSub: "This is your shop front. Customers will see it when LyniaGo Shops opens.",
    // The restaurant line's "ordered about twice as often" is a claim about dishes; a shop's note keeps the rule only.
    itemPhotoNote: "Every item needs one photo before customers see it. Pick the file from this device; we shrink it for you.",
    itemCropSub: "Square crop. Fill the frame with the item, not the table.",
    itemPreviewLabel: "HOW IT LOOKS IN YOUR SHOP",
    itemPreviewSub: "How the photo reads at list size",
  };
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
