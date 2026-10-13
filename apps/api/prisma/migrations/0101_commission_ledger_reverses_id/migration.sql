-- Admin console v2 §6 (PR 6): an admin reversal (a `reversal` ledger debit) can name the credit it corrects,
-- so later reversals can never take back more than that credit added. Expand-only and online-safe: one
-- NULLABLE column with no default (a catalog-only change, no table rewrite). Every existing row reads NULL
-- ("not a reversal of a named entry"); the still-live old revision neither reads nor writes it. No foreign
-- key: the ledger is append-only and a row never disappears, so there is nothing to cascade.
ALTER TABLE "commission_ledger" ADD COLUMN "reverses_id" UUID;
