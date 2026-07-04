import { normalizePhone } from "@lynia/shared";

/**
 * Pure planning core for the phone-backfill script (scripts/normalize-phones.ts). Given the current
 * profile rows it decides, with NO database access, what should happen to each — so the risky part
 * (collision grouping + survivor choice + which merges are safe) is unit-tested in isolation. The
 * script is a thin Prisma shell that loads rows, calls plan(), prints, and executes the plan.
 */
export type ProfileForBackfill = {
  id: string;
  phone: string;
  createdAt: Date;
  /** Present when the profile is a rider (money + reputation live here — never auto-merge it away). */
  hasRider: boolean;
  ordersAsCustomer: number;
  ratingsGiven: number;
};

export type BackfillPlan = {
  unchanged: number;
  /** Row whose canonical form is free — a plain phone rewrite. */
  renames: { id: string; from: string; to: string }[];
  /** Collision where every loser is empty and can be folded into the survivor. */
  merges: { target: string; survivorId: string; survivorPhone: string; loserIds: string[] }[];
  /** Collision blocked by real data on a non-survivor — left untouched for a human. */
  manual: { target: string; rows: { id: string; phone: string; reason: string }[] }[];
  /** Phone that can't be parsed to E.164 — left untouched. */
  invalid: { id: string; phone: string }[];
};

/** A row is safe to fold into a survivor only when it holds nothing worth preserving. */
export function isEmpty(r: ProfileForBackfill): boolean {
  return !r.hasRider && r.ordersAsCustomer === 0 && r.ratingsGiven === 0;
}

/** Prefer the already-canonical row, then the one with real data, then the oldest, then stable by id. */
export function pickSurvivor(rows: ProfileForBackfill[], target: string): ProfileForBackfill {
  return [...rows].sort((a, b) => {
    const canon = Number(b.phone === target) - Number(a.phone === target);
    if (canon) return canon;
    const substance = Number(!isEmpty(b)) - Number(!isEmpty(a));
    if (substance) return substance;
    const age = a.createdAt.getTime() - b.createdAt.getTime();
    if (age) return age;
    return a.id < b.id ? -1 : 1;
  })[0];
}

function reason(r: ProfileForBackfill, survivorId: string): string {
  if (r.id === survivorId) return "survivor (kept)";
  if (isEmpty(r)) return "empty loser — but group blocked by a non-empty sibling";
  return `has ${r.hasRider ? "rider record; " : ""}${r.ordersAsCustomer} orders; ${r.ratingsGiven} ratings`;
}

export function plan(rows: ProfileForBackfill[]): BackfillPlan {
  // Group by canonical target. normalizePhone is idempotent, so a row already AT the target lands in
  // the same group as any row that normalizes TO it — that's what surfaces every collision.
  const byTarget = new Map<string, ProfileForBackfill[]>();
  const invalid: BackfillPlan["invalid"] = [];
  for (const r of rows) {
    const target = normalizePhone(r.phone);
    if (!target) {
      invalid.push({ id: r.id, phone: r.phone });
      continue;
    }
    const g = byTarget.get(target) ?? [];
    g.push(r);
    byTarget.set(target, g);
  }

  const out: BackfillPlan = { unchanged: 0, renames: [], merges: [], manual: [], invalid };
  for (const [target, group] of byTarget) {
    if (group.length === 1) {
      const r = group[0];
      if (r.phone === target) out.unchanged++;
      else out.renames.push({ id: r.id, from: r.phone, to: target });
      continue;
    }
    const survivor = pickSurvivor(group, target);
    const losers = group.filter((r) => r.id !== survivor.id);
    if (losers.some((r) => !isEmpty(r))) {
      out.manual.push({ target, rows: group.map((r) => ({ id: r.id, phone: r.phone, reason: reason(r, survivor.id) })) });
    } else {
      out.merges.push({ target, survivorId: survivor.id, survivorPhone: survivor.phone, loserIds: losers.map((r) => r.id) });
    }
  }
  return out;
}
