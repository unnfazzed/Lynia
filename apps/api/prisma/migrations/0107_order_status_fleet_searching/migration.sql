-- Own bikers (docs/designs/own-bikers.md, ledger D-117): a "My bikers" booking rings the owner's own bikers in
-- its own status, so no reader keyed on `requested` (the kitchen phase) or `open_for_offers` (the public board)
-- ever picks it up. Additive enum value only, alone in its migration: ADD VALUE can't be used in the same
-- transaction that adds it, and nothing here uses it. IF NOT EXISTS keeps re-runs idempotent (as 0018).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'fleet_searching';
