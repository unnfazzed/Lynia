-- Rider KYC "expired" state (rider-journey 1·b2): a previously-verified rider whose national ID has
-- since lapsed and who must re-verify. Additive enum value only — existing rows are unaffected, and
-- the online gate already blocks anything that isn't `verified`, so an expired rider can't go online.
--
-- ADD VALUE is non-transactional-safe in PG12+ as long as the value isn't used in DDL in the same
-- migration (it isn't — this migration adds no columns). IF NOT EXISTS keeps re-runs idempotent.
ALTER TYPE "KycStatus" ADD VALUE IF NOT EXISTS 'expired';
