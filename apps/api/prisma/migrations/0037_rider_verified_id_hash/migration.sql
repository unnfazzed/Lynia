-- IR26-04 vendor-document dedupe: the HMAC hash of the document number the KYC vendor actually
-- verified (LR8 — never the raw number), written by applyKycResult from the Didit decision webhook on
-- a `verified` outcome. The dedupe axis the typed id_number_hash can't cover: a ban-evader can TYPE a
-- different national ID but must SHOW the same physical document to the vendor. Comparable directly to
-- profiles.id_number_hash (both are HMACs of the pii-normalized number). Additive + idempotent;
-- nullable so existing riders are untouched. Its partial index is built CONCURRENTLY in 0038.
-- Retained on account erasure like id_number_hash (DS15-02b) — a one-way hash, and the signal that
-- catches a banned identity re-entering.
ALTER TABLE "riders" ADD COLUMN IF NOT EXISTS "verified_id_hash" TEXT;
