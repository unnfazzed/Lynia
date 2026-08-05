import type { MerchantDishResponse, MerchantProfileResponse } from "@lynia/shared";
import { DAY_KEYS, formatWindow, type PartialMerchantHours } from "./hours";

/**
 * M0·2 `setup` (r-merchant.jsx:103-128) — "Four things and you're taking orders."
 *
 * Each item's state is derived from something that is genuinely knowable, never assumed:
 *
 *  - **menu** and **hours** are server state (`GET /merchant/dishes`, `GET /merchant/me`) and are
 *    actionable — the merchant finishes them on `/menu` and `/hours`.
 *  - **payment** is NOT merchant-editable in this codebase and is deliberately modelled as a
 *    read-only "on file" fact rather than a task with a button. `MerchantProfileResponse` exposes only
 *    `ownerPhoneMasked`; the number an order actually quotes to a customer is
 *    `merchant.location.contactPhone ?? ownerProfile.phone` (apps/api food-order.service.ts's
 *    `toResponse`), neither of which the merchant API lets this app read in full or write at all
 *    (`UpdateMerchantProfileRequest` has no such field). Inventing an editor here would be inventing
 *    an endpoint, so the item states what IS on file and who changes it.
 *  - **alarm** is a fact about THIS TABLET, not about the shop — "play it once so the kitchen knows
 *    the sound". It is stored locally and the copy says so; nothing is claimed to be saved to LyniaGo.
 *
 * The go-live gate is likewise real: `pilotEnabled` is the flag the customer read API actually filters
 * on (merchant.service.ts `where: { pilotEnabled: true }`), and it is set by LyniaGo admin, not by
 * finishing this list. The screen says that instead of implying the last tick flips it.
 */

export type SetupItemKey = "menu" | "hours" | "payment" | "alarm";

export interface SetupItem {
  key: SetupItemKey;
  title: string;
  detail: string;
  done: boolean;
  /** Absent when there is nothing this tablet can do about it (see `payment` above). */
  action?: { label: string; href?: string };
}

const ALARM_TESTED_KEY = "lynia_merchant_alarm_tested";

/** Per-tablet, per-merchant: a second kitchen's tablet has its own volume to judge, so this must not
 *  read as done just because another device tested it. Never throws — private-mode/blocked storage
 *  simply reads as "not tested yet", which is the safe direction. */
export function readAlarmTested(merchantId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${ALARM_TESTED_KEY}:${merchantId}`) === "1";
  } catch {
    return false;
  }
}

export function markAlarmTested(merchantId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${ALARM_TESTED_KEY}:${merchantId}`, "1");
  } catch {
    // Storage unavailable — the tick just won't persist across a reload. Nothing to recover.
  }
}

/** Summarises a weekly schedule the way M0·2's own sub-line does ("Mon–Sat 09:00–21:00"): the open
 *  days, collapsed to a range when they're contiguous and share one window. */
export function summariseHours(hours: PartialMerchantHours | null): string {
  if (!hours) return "Not set yet";
  const openDays = DAY_KEYS.filter((d) => hours[d]);
  if (openDays.length === 0) return "Every day marked closed";

  const labels: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  const windows = new Set(openDays.map((d) => formatWindow(hours[d])));
  const contiguous = openDays.every((d, i) => i === 0 || DAY_KEYS.indexOf(d) === DAY_KEYS.indexOf(openDays[i - 1]!) + 1);

  if (windows.size === 1 && contiguous && openDays.length > 1) {
    return `${labels[openDays[0]!]}–${labels[openDays[openDays.length - 1]!]} ${[...windows][0]}`;
  }
  if (openDays.length === 1) return `${labels[openDays[0]!]} ${formatWindow(hours[openDays[0]!])}`;
  return `${openDays.length} days a week`;
}

export interface SetupState {
  items: SetupItem[];
  /** Only the two items this tablet can actually finish; `payment` is never counted as outstanding
   *  work because there is nothing here to do about it. */
  remaining: number;
  /** The real customer-visibility flag, straight off the profile. */
  live: boolean;
}

export function buildSetupState({
  profile,
  dishes,
  alarmTested,
}: {
  profile: MerchantProfileResponse;
  dishes: MerchantDishResponse[];
  alarmTested: boolean;
}): SetupState {
  // D-31: a photoless dish saves as a draft and is excluded from the customer menu entirely, so a
  // menu of nothing but drafts is not a menu customers can order from.
  const live = dishes.filter((d) => !d.isDraft);
  const drafts = dishes.length - live.length;
  const menuDone = live.length > 0;

  const hoursDone = !!profile.hours && DAY_KEYS.some((d) => profile.hours?.[d]);

  const items: SetupItem[] = [
    {
      key: "menu",
      title: "Add your menu",
      detail: menuDone
        ? `${live.length} dish${live.length === 1 ? "" : "es"} live${drafts > 0 ? ` · ${drafts} draft${drafts === 1 ? "" : "s"} still need a photo` : ""}`
        : dishes.length > 0
          ? `${dishes.length} dish${dishes.length === 1 ? "" : "es"} saved, but every one is a draft — each needs a photo before customers see it`
          : "No dishes yet — customers can't order until there's at least one",
      done: menuDone,
      action: { label: menuDone ? "Edit the menu" : "Do it now", href: "/menu" },
    },
    {
      key: "hours",
      title: "Set your hours",
      detail: summariseHours(profile.hours ?? null),
      done: hoursDone,
      action: { label: hoursDone ? "Change them" : "Do it now", href: "/hours" },
    },
    {
      key: "payment",
      title: "Merchant payment numbers",
      // Stated as a fact on file, not as a tick the merchant earns — see this file's header.
      detail: `Wallet orders quote ${profile.ownerPhoneMasked} — the number registered with LyniaGo. Call support to change it.`,
      done: true,
    },
    {
      key: "alarm",
      title: "Test the order alarm",
      detail: alarmTested
        ? "Tested on this tablet — you know the sound"
        : "Play it once on this tablet so the kitchen knows the sound. Keep the volume up.",
      done: alarmTested,
      action: { label: "Play it now" },
    },
  ];

  return {
    items,
    remaining: items.filter((i) => !i.done && i.action).length,
    live: profile.pilotEnabled,
  };
}
