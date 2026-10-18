import type { MerchantProfileResponse } from "@lynia/shared";
import { SF } from "./shop-front-copy";
import { vocabulary } from "./vocabulary";

/**
 * Shop front v1 (packages/design/handoff/shop-front-v1, ledger D-115): the screen's pure rules, kept out of
 * the page so they can be tested on their own — the tag field, the value-compared dirty check, and when
 * Save may run.
 */

export type PriceLevel = 1 | 2 | 3;

/** A photo slot's change since the last loaded or saved profile. `undefined` = untouched. */
export type PhotoChange = { kind: "new"; key: string; previewUrl: string } | { kind: "removed" } | undefined;

export interface ShopFrontValues {
  name: string;
  description: string;
  tags: string[];
  priceLevel: PriceLevel | null;
}

/** `food` = restaurant; `shop` = shop and pharmacy (the handoff's copy keys). */
export type ShopFrontWords = "food" | "shop";

export function wordsFor(profile: Pick<MerchantProfileResponse, "businessType">): ShopFrontWords {
  return profile.businessType === "shop" ? "shop" : "food";
}

/** Only a shop waits for LyniaGo Shops to open (the intro strip and the "Saved" toast). */
export function isShopNotLive(profile: Pick<MerchantProfileResponse, "businessType" | "pilotEnabled">): boolean {
  return profile.businessType === "shop" && !profile.pilotEnabled;
}

export function valuesFrom(profile: MerchantProfileResponse): ShopFrontValues {
  const p = profile.priceLevel;
  return {
    name: profile.name,
    description: profile.description ?? "",
    tags: [...profile.cuisineTags],
    priceLevel: p === 1 || p === 2 || p === 3 ? p : null,
  };
}

/** Dirty is computed by comparing values, never stored: undoing an edit by hand makes the form clean again. */
export function isDirty(form: ShopFrontValues, saved: ShopFrontValues, banner: PhotoChange, logo: PhotoChange): boolean {
  return (
    banner !== undefined ||
    logo !== undefined ||
    form.name !== saved.name ||
    form.description !== saved.description ||
    form.priceLevel !== saved.priceLevel ||
    form.tags.length !== saved.tags.length ||
    form.tags.some((t, i) => t !== saved.tags[i])
  );
}

/** The handoff's `canSave`: dirty, not already saving, a name, and no photo still shrinking or uploading. */
export function canSave(form: ShopFrontValues, dirty: boolean, saving: boolean, photoBusy: boolean): boolean {
  return dirty && !saving && form.name.trim().length > 0 && !photoBusy;
}

const MAX_TAGS = 3;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type AddTagResult =
  | { kind: "added"; tags: string[] }
  | { kind: "duplicate"; tags: string[]; existing: string }
  | { kind: "ignored"; tags: string[] };

/**
 * The one way a tag is added — the Add pill, the keyboard's action key, a comma, blur, or a suggestion tap.
 * Trimmed, cut to `SF.tagMax`, at most three, and a duplicate (case and spaces ignored) is reported, not added.
 */
export function addTag(tags: string[], draft: string): AddTagResult {
  const tag = draft.trim().slice(0, SF.tagMax).trim();
  if (!tag || tags.length >= MAX_TAGS) return { kind: "ignored", tags };
  const existing = tags.find((t) => same(t, tag));
  if (existing) return { kind: "duplicate", tags, existing };
  return { kind: "added", tags: [...tags, tag] };
}

export function tagsFull(tags: string[]): boolean {
  return tags.length >= MAX_TAGS;
}

/** One-tap suggestions: the shop kind's starter aisles, or the handoff's proposed restaurant list; minus any
 *  already added, filtered by prefix while typing. */
export function tagSuggestions(profile: Pick<MerchantProfileResponse, "businessType" | "shopKind">, tags: string[], draft: string): string[] {
  const all = profile.businessType === "shop" ? vocabulary("shop", profile.shopKind).starterCategories : SF.suggest.food;
  const prefix = draft.trim().toLowerCase();
  return all.filter((s) => !tags.some((t) => same(t, s)) && (!prefix || s.toLowerCase().startsWith(prefix)));
}

/** A keydown that means "add this tag". Gboard often sends `keyCode 229` with no usable `key`, so the page
 *  also adds on a `beforeinput` of `insertLineBreak` and on a comma that lands in the field's value. */
export function isAddKey(e: { key?: string; keyCode?: number }): boolean {
  return e.key === "Enter" || e.key === "," || e.keyCode === 13;
}

/** The field's new value, split at a typed comma: the part before it is a tag to add, the rest stays. */
export function splitAtComma(value: string): { add: string; rest: string } | null {
  const i = value.indexOf(",");
  return i < 0 ? null : { add: value.slice(0, i), rest: value.slice(i + 1).replace(/,/g, "") };
}
