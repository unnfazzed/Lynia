-- KB-POD-DISPUTE Phase A: proof-of-drop evidence on the order. A rider whose hand-off is disputed
-- (recipient took the goods but withheld the delivery code) can attach a photo + their GPS + a
-- timestamp, so ops has real evidence to adjudicate a Phase-B "delivered — code bypass" decision.
-- Optional, never gates a status transition. All additive/nullable — no rewrite, older rows stay null.
ALTER TABLE "orders" ADD COLUMN "delivery_proof_key" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_proof_lat" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "delivery_proof_lng" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "delivery_proof_at" TIMESTAMP(3);
