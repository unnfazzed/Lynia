import type { WalletEntry } from "@lynia/shared";
import { filterLedgerEntries } from "../wallet-ledger";

function entry(overrides: Partial<WalletEntry>): WalletEntry {
  return {
    id: "e1",
    type: "commission",
    amount: -0.3,
    balanceAfter: 4.3,
    title: "Commission",
    meta: "10% of $3.00",
    createdAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterLedgerEntries (plan §5 B3 — Money tab ledger filterable Parcel / Food)", () => {
  const commission = entry({ id: "c1", type: "commission" });
  const topup = entry({ id: "t1", type: "topup", amount: 5, meta: "EcoCash" });
  const grace = entry({ id: "g1", type: "grace", amount: 5 });

  it("'all' returns every entry unchanged, regardless of type", () => {
    expect(filterLedgerEntries([commission, topup, grace], "all")).toEqual([commission, topup, grace]);
  });

  it("'parcel' keeps only commission rows — every commission row is parcel-sourced today (chargeCommission's own orderType==='parcel' guard)", () => {
    expect(filterLedgerEntries([commission, topup, grace], "parcel")).toEqual([commission]);
  });

  it("'food' is always empty — no wire-contract field exists yet to identify a food-sourced commission row (Lane C gap, flagged in the PR)", () => {
    expect(filterLedgerEntries([commission, topup, grace], "food")).toEqual([]);
  });

  it("a wallet-level event (top-up/grace) never appears under 'parcel' or 'food' — it isn't a per-job event", () => {
    expect(filterLedgerEntries([topup, grace], "parcel")).toEqual([]);
    expect(filterLedgerEntries([topup, grace], "food")).toEqual([]);
  });
});
