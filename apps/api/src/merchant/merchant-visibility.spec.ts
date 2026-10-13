import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { CUSTOMER_VISIBLE_RESTAURANT, customerVisibleShop } from "./merchant-lookup.util";

/**
 * Admin console v2 §5: customers only ever see — and order from — a LIVE business. The rules are Prisma
 * `where` objects, so this evaluates them the way Postgres would against merchant rows in every application
 * state (a tiny matcher for the operators the rules use: equality, `not`, `in`, `OR`).
 */
type Row = Record<string, unknown>;
function matches(where: Record<string, unknown>, row: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Record<string, unknown>[]).some((w) => matches(w, row));
    if (cond !== null && typeof cond === "object") {
      const c = cond as { not?: unknown; in?: unknown[] };
      if ("not" in c) return row[key] !== c.not;
      if ("in" in c) return (c.in ?? []).includes(row[key]);
      return false;
    }
    return row[key] === cond;
  });
}

const restaurant = (over: Row): Row => ({ businessType: "restaurant", shopKind: null, pilotEnabled: false, applicationStatus: "applied", ...over });
const pharmacy = (over: Row): Row => ({ businessType: "shop", shopKind: "pharmacy", pilotEnabled: false, applicationStatus: "applied", ...over });
const ON = { SHOPS_ENABLED: "true", PHARMACY_ENABLED: "true" } as Pick<Env, "SHOPS_ENABLED" | "PHARMACY_ENABLED">;

describe("customer visibility follows the application state (admin console v2 §5)", () => {
  it("only a live restaurant is visible — not applied, in review, approved, rejected or suspended", () => {
    expect(matches(CUSTOMER_VISIBLE_RESTAURANT, restaurant({ pilotEnabled: true, applicationStatus: "live" }))).toBe(true);
    for (const applicationStatus of ["applied", "reviewing", "approved", "rejected", "suspended"]) {
      expect(matches(CUSTOMER_VISIBLE_RESTAURANT, restaurant({ applicationStatus }))).toBe(false);
    }
  });

  it("a suspended business stays hidden even if an older revision's switch turned pilotEnabled back on", () => {
    expect(matches(CUSTOMER_VISIBLE_RESTAURANT, restaurant({ pilotEnabled: true, applicationStatus: "suspended" }))).toBe(false);
    expect(matches(customerVisibleShop(ON), pharmacy({ pilotEnabled: true, applicationStatus: "suspended" }))).toBe(false);
  });

  it("a pharmacy already live stays live (grandfathered, whatever its licence)", () => {
    expect(matches(customerVisibleShop(ON), pharmacy({ pilotEnabled: true, applicationStatus: "live" }))).toBe(true);
    expect(matches(customerVisibleShop(ON, "pharmacy"), pharmacy({ pilotEnabled: true, applicationStatus: "live" }))).toBe(true);
  });

  it("a business an older revision switched on before it was reviewed still shows (the switch wins during a rollout)", () => {
    expect(matches(CUSTOMER_VISIBLE_RESTAURANT, restaurant({ pilotEnabled: true, applicationStatus: "applied" }))).toBe(true);
  });
});
