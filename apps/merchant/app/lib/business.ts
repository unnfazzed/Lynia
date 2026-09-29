"use client";

import { useEffect, useState } from "react";
import type { MerchantProfileResponse } from "@lynia/shared";
import { getMerchantProfile } from "./menu-api";

/**
 * The signed-in person's business, read once per page load and shared by the shell (merchant web upgrade
 * L2): the nav needs to know restaurant or shop, and whether Book a rider is on. Pages that show the
 * business's own details still fetch it themselves, fresh; this copy is only for the shell's choices.
 * A failed read isn't cached, so the next mount tries again.
 */
let pending: Promise<MerchantProfileResponse | null> | null = null;
let known: MerchantProfileResponse | null = null;

export function loadBusiness(): Promise<MerchantProfileResponse | null> {
  if (!pending) {
    // Never rejects, even on a synchronous throw: a shell that can't tell restaurant from shop falls back
    // to the restaurant's drawn words and nav, which is where it started.
    pending = Promise.resolve()
      .then(() => getMerchantProfile())
      .then((b) => {
        known = b;
        return b;
      })
      .catch(() => {
        pending = null;
        return null;
      });
  }
  return pending;
}

/** Seed the cache from a page that just read the profile anyway. */
export function primeBusiness(business: MerchantProfileResponse): void {
  known = business;
  pending = Promise.resolve(business);
}

/** Whether this tab has known the person as a member of a business (L4: a later `not_a_member` then
 *  means they were removed, not that they never had one). */
export function hasKnownBusiness(): boolean {
  return known !== null;
}

/** Forget it (sign-out, or tests). */
export function clearBusinessCache(): void {
  known = null;
  pending = null;
}

export function useBusiness(): MerchantProfileResponse | null {
  const [business, setBusiness] = useState<MerchantProfileResponse | null>(known);
  useEffect(() => {
    let alive = true;
    void loadBusiness().then((b) => {
      if (alive) setBusiness(b);
    });
    return () => {
      alive = false;
    };
  }, []);
  return business;
}
