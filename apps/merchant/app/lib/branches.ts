"use client";

import { useEffect, useState } from "react";
import type { MerchantBranchResponse, MerchantBusinessType, MerchantProfileResponse } from "@lynia/shared";
import { listBranches } from "./branches-api";

/**
 * Branches (merchant-mobile README section F, handoff `branches/`, ledger D-51): the owner's branches,
 * which one this app is working in, and the rules the screens share. Pure helpers are exported for tests.
 */

/** Live for customers: ops switched it on. Shops go live through the same switch as restaurants since
 *  customer Shops and Pharmacy opened (ledger D-58), so the flag alone decides for both (D-51). */
export function isLive(b: { pilotEnabled: boolean; businessType: MerchantBusinessType }): boolean {
  return b.pilotEnabled;
}

/** The header chevron (README §1): an owner with 2+ branches. MJ-RM16: an owner of ANY of them, not only
 *  of this one — an owner who handed this branch over works in it as Staff and still owns the rest, and the
 *  chevron is their only way back. Plain staff (no owner row) never get it. */
export function showBranchChevron(
  business: Pick<MerchantProfileResponse, "myRole"> | null,
  branches: readonly Pick<MerchantBranchResponse, "role">[],
): boolean {
  if (!business || branches.length < 2) return false;
  return business.myRole === "owner" || branches.some((b) => b.role === "owner");
}

/** MJ-RM15: the queue is the server's current branch for this person. When it carries another branch's
 *  orders, another device switched branch: the id this screen should move to, else null. */
export function driftedBranchId(orders: readonly { merchantId: string }[], businessId: string | null | undefined): string | null {
  if (!businessId) return null;
  return orders.find((o) => o.merchantId !== businessId)?.merchantId ?? null;
}

/** The Orders home's not-live state (README §5, ledger D-51). E2E 2026-10-05 FS-4 (owner: "Reuse 'Almost
 *  ready'"): any business ops haven't switched on, whatever its branch count — a single new business was
 *  otherwise told "You're open" while customers couldn't see it. */
export function showNotLiveHome(business: Pick<MerchantProfileResponse, "pilotEnabled" | "businessType"> | null): boolean {
  return !!business && !isLive(business);
}

/** C7's four API refusals (README "Error copy"), by the API's `reason`. Inline under a field, or a banner. */
export type BranchFormError = { where: "name" | "location" | "banner"; message: string };

export const BRANCH_ERRORS = {
  branch_name_taken: {
    where: "name",
    message: "You already have a branch with that name. Add the area, like “Mama’s Kitchen · Avondale”.",
  },
  outside_service_area: { where: "location", message: "That address is outside the area LyniaGo covers for now." },
  branch_limit: { where: "banner", message: "You can have up to 20 branches. Message LyniaGo on WhatsApp for more." },
  on_hold: { where: "banner", message: "This account is on hold. Message LyniaGo on WhatsApp to sort it out." },
} satisfies Record<string, BranchFormError>;

export function branchErrorFor(reason: string | undefined, fallback: string): BranchFormError {
  const known = reason !== undefined && Object.hasOwn(BRANCH_ERRORS, reason) ? BRANCH_ERRORS[reason as keyof typeof BRANCH_ERRORS] : null;
  return known ?? { where: "banner", message: fallback };
}

/** The copy row's meta line (README §4.3): "12 dishes in 3 categories" / "40 items in 5 categories". */
export function catalogueCount(businessType: MerchantBusinessType | undefined, items: number, categories: number): string {
  const shop = businessType === "shop";
  const noun = shop ? (items === 1 ? "item" : "items") : items === 1 ? "dish" : "dishes";
  return `${items} ${noun} in ${categories} ${categories === 1 ? "category" : "categories"}`;
}

// ── The branch list, shared by the header, C6 and C4 ─────────────────────────────────────────────

let pending: Promise<MerchantBranchResponse[]> | null = null;
let known: MerchantBranchResponse[] | null = null;
const listeners = new Set<(b: MerchantBranchResponse[]) => void>();

export function loadBranches(): Promise<MerchantBranchResponse[]> {
  if (!pending) {
    pending = listBranches()
      .then((r) => {
        known = r.branches;
        for (const l of listeners) l(r.branches);
        return r.branches;
      })
      .catch(() => {
        pending = null;
        return known ?? [];
      });
  }
  return pending;
}

/** After a switch or a new branch: the list's order and contents changed. */
export function refreshBranches(): Promise<MerchantBranchResponse[]> {
  pending = null;
  return loadBranches();
}

export function clearBranchesCache(): void {
  pending = null;
  known = null;
}

export function useBranches(enabled = true): MerchantBranchResponse[] {
  const [branches, setBranches] = useState<MerchantBranchResponse[]>(known ?? []);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    listeners.add(setBranches);
    void loadBranches().then((b) => {
      if (alive) setBranches(b);
    });
    return () => {
      alive = false;
      listeners.delete(setBranches);
    };
  }, [enabled]);
  return enabled ? branches : [];
}

// ── Which branch the screens are showing ─────────────────────────────────────────────────────────

/** Bumped on every switch. The app shell keys the page on it, so every screen re-mounts and re-reads
 *  its data for the new branch, while the shell (socket, alarm) stays up. */
let epoch = 0;
const epochListeners = new Set<(e: number) => void>();

export function branchEpoch(): number {
  return epoch;
}

export function bumpBranchEpoch(): void {
  epoch += 1;
  for (const l of epochListeners) l(epoch);
}

export function useBranchEpoch(): number {
  const [e, setE] = useState(epoch);
  useEffect(() => {
    epochListeners.add(setE);
    return () => {
      epochListeners.delete(setE);
    };
  }, []);
  return e;
}
