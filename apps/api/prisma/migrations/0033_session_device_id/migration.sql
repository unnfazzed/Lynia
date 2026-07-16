-- KB-IDENTITY-BINDING L1 (soft device binding): record the client's stable per-install device id on the
-- session it mints, so (a) new-account creation can be throttled per device (raising the cost of
-- phone-only Sybil signups) and (b) ops / the recycle-detection signal (L0) can see the device→account
-- history. Nullable, no default — additive-only, older clients that send no `x-device-id` just leave it
-- null, exactly as before. Not an identity guarantee (a reinstall mints a new id); the hardware-backed
-- guarantee is L3 (Play Integrity / App Attest), still founder/vendor-gated.
ALTER TABLE "sessions" ADD COLUMN "device_id" TEXT;
