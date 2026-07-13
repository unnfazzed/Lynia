-- No-supply expiry flag (UX-2026-07-12 #11). Set only when an offer window closed with zero bids AND
-- zero riders online near pickup, so the in-app feed / expired snapshot can pick the honest "nobody
-- was online" copy instead of "raise your price". Additive, nullable, no default — online-safe.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "expiry_no_supply" BOOLEAN;
