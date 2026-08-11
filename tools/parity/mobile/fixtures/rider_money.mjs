// RJM.money — the Money tab, populated. Commission is live (GET /wallet/config enabled, 10%), the
// prepaid balance sits comfortably above the floor (green hero), and the ledger shows a realistic mix
// of parcel-commission debits + a top-up credit + the opening grace credit. No active job, so the
// cash-held "owed" strip reads zero. Wallet/ledger amounts are plain NUMBERS (not serialised strings).
import { installRouter, withQuery } from "./_harness.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1200;

const config = { enabled: true, ratePct: 10, floor: 2, graceCredit: 3, minTopUp: 5, maxTopUp: 100 };

const wallet = { balance: 8.4, currency: "USD", updatedAt: new Date(Date.now() - 120_000).toISOString() };

function entry(n, type, amount, balanceAfter, title, meta, extra = {}) {
  return {
    id: `led_${String(n).padStart(3, "0")}`,
    type,
    amount,
    balanceAfter,
    title,
    meta,
    createdAt: new Date(Date.now() - n * 3_600_000).toISOString(),
    ...extra,
  };
}

const ledger = {
  entries: [
    entry(1, "commission", -0.45, 8.4, "Commission", "10% of $4.50 · delivery to Avondale", { ratePct: 10, fare: 4.5, orderId: "0a1b2c3d-0000-4000-8000-0000000op001" }),
    entry(2, "commission", -0.6, 8.85, "Commission", "10% of $6.00 · delivery to Msasa Park", { ratePct: 10, fare: 6.0, orderId: "0a1b2c3d-0000-4000-8000-0000000op002" }),
    entry(3, "topup", 10.0, 9.45, "Top-up", "EcoCash · ref TXN8842", { rail: "ecocash", ref: "TXN8842" }),
    entry(4, "commission", -0.52, -0.55, "Commission", "10% of $5.25 · delivery to Highfield", { ratePct: 10, fare: 5.25, orderId: "0a1b2c3d-0000-4000-8000-0000000op003" }),
    entry(5, "grace", 3.0, 3.0, "Welcome credit", "Added to get you started"),
  ],
};

installRouter([
  { match: "/wallet/config", json: config },
  { match: "/wallet/ledger", json: ledger },
  { match: "/wallet", method: "GET", json: wallet },
  { match: "/orders/mine/active", json: null },
]);

export default { wrap: withQuery() };
