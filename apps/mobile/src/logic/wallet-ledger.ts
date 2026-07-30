import type { WalletEntry } from "@lynia/shared";

/**
 * The Money tab's ledger filter (plan §5 B3: "one earnings ledger filterable Parcel / Food").
 * "all" shows every wallet event (commission, top-up, grace, adjustment); "parcel"/"food" narrow to
 * the per-job `commission` debits for that vertical only — a top-up or grace credit isn't a Parcel or
 * a Food event, it's a wallet-level one, so it drops out of both narrower tabs (only "all" shows it).
 */
export type LedgerFilter = "all" | "parcel" | "food";

/**
 * `WalletEntry` carries no `orderType` yet — chargeCommission only ever writes a `commission` row for
 * `orderType === "parcel"` (order-lifecycle.service.ts's own A-5 guard; a merchant order's commission
 * is Lane C's still-unwired job, tracked in the plan's §10 blockers). That makes every commission row
 * that exists today provably parcel-sourced, so "parcel" can filter honestly without a wire-contract
 * change — but "food" can only ever be empty until Lane C adds the field and starts writing food
 * commission rows. Flagged here rather than faked, mirroring B2's JobCard dark-until-wired precedent.
 */
export function filterLedgerEntries(entries: readonly WalletEntry[], filter: LedgerFilter): WalletEntry[] {
  if (filter === "all") return [...entries];
  if (filter === "food") return []; // no food commission rows exist yet — see doc comment above.
  return entries.filter((e) => e.type === "commission");
}
