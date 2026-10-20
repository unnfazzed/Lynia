/**
 * KYC decisions: applying a vendor result, the admin override, and settling the national ID on approval.
 * A part of RiderService (R-6): `this.svc` is the service itself.
 */
import { BadRequestException, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { KycDeclineReason, kycDeclineClass, normalizeNationalId } from "@lynia/shared";
import { DIDIT_APPROVED_STATUS, DIDIT_IN_REVIEW_STATUS, isDiditDocumentExpired, kycIdExpiryOnLapse, SELFIE_CAMERA_QUALITY } from "../kyc/didit";
import { KYC_PUSH_COPY, type KycPushVariant } from "../kyc/kyc-push-copy";
import { auditData } from "../admin/admin.shared";
import { domainEvents } from "../common/domain-events";
import { KYC_RESOLVED_BY_ADMIN, KYC_RESOLVED_BY_VENDOR, KYC_UNREADABLE_DECLINES_BEFORE_REVIEW, KYC_WEBHOOK_ACTOR, type Kyc, SELFIE_CHECK_UNVERIFIED, declineAttemptsWrite, reviewStale, verifiedIdInUse } from "./rider.helpers";
import type { RiderService } from "./rider.service";

export class RiderKycDecisions {
  constructor(private readonly svc: RiderService) {}
  /**
   * Vendor callback result → flip the rider's KYC status. Monotonic by `eventAt`: the update only
   * applies when this webhook is newer than the last applied one (kycResolvedAt null or older), so a
   * replayed or out-of-order delivery can't overwrite a newer decision (an exact replay has the same
   * timestamp → not newer → ignored). kycRef is unique, so this matches at most one rider.
   * `updated: 0` means no rider has this ref, or the event was stale/duplicate.
   */
  async applyKycResult(
    kycRef: string,
    vendorOutcome: "verified" | "failed" | "expired",
    eventAt: Date,
    vendorReason?: string | null,
    // IR26-04: the document number the vendor actually verified (extractDiditDocumentNumber), when the
    // decision payload exposes one. Only consulted on a `verified` outcome; null degrades to the
    // pre-IR26-04 behavior so a payload-shape mismatch can never wedge real verifications.
    verifiedDocNumber?: string | null,
    // First Run v2 F6 (D-82 §4): the verified document's expiry date (extractDiditDocumentExpiry), when the
    // decision payload carries one. Stored on a `verified` outcome; an `expired` one stamps the lapse day.
    documentExpiresOn?: Date | null,
    // Owner 2026-10-15: the vendor declined only because the selfie couldn't be checked on this phone's camera,
    // while the ID itself passed (isSelfieCameraFailure). Arrives as `verified`; the verify carries the flag.
    opts: { selfieUnverified?: boolean } = {},
  ): Promise<{ updated: number; skipped?: "repeat" | "admin_decided" }> {
    // KYC-R26-08: a verify whose document had ALREADY expired on the day it was decided is a decline, with the
    // canonical `id_expired` reason (KYC_DECLINE_REASON_LABELS: "ID document expired"). Didit's workflow is
    // meant to catch this itself, but its document-validity check is configurable per workflow and the date is
    // right here in the payload, so an expired card can't onboard a rider on a vendor setting. Applied before
    // anything else, so the outcome is an ordinary decline end to end: the A-02 counter, the audit row, the
    // push and the offline demotion all follow the `failed` path (no dedupe/adoption — nothing is verified).
    const expiredDocument = vendorOutcome === "verified" && isDiditDocumentExpired(documentExpiresOn, eventAt);
    const status: "verified" | "failed" | "expired" = expiredDocument ? "failed" : vendorOutcome;
    const reason = expiredDocument ? KycDeclineReason.ID_EXPIRED : vendorReason;
    if (expiredDocument) {
      this.svc.logger.warn(`KYC ${kycRef}: approved, but the ID document expired before the decision — declined id_expired (KYC-R26-08)`);
    }
    // DS15-06: the CAS status mutation AND its AuditLog row commit in ONE transaction — matching the
    // manual adminSetKyc path and admin-riders.service's suspend/lift/ban CAS+audit pairs. Previously the
    // audit row was a separate post-commit `create` in its own warn-only try/catch: if that insert failed
    // (rare, but real — e.g. a connection blip right after the first commit), an automated KYC
    // approve/decline committed with ZERO audit trail, and via KB-FEED-SYNTH the rider silently lost their
    // account-status feed row too (feedForUser derives it from this AuditLog table). Making the pair atomic
    // means an audit-write failure rolls the status write back, so the webhook simply retries — never a
    // committed-without-audit decision. The monotonic/replay-safe guards (F-13 counter, the kycRef +
    // kycResolvedAt CAS `where`) are unchanged: still a guarded `updateMany`, not a blind `update`.
    //
    // D-75: a verified decision may also write the profile (it adopts the vendor-verified number as the
    // account's national ID when the account has none — see below). That write is guarded so it can't
    // collide (the number's advisory lock, the collision counts, a CAS), but the partial unique index on
    // live id_number_hash (IR26-05) stays the backstop for any writer that skips the lock. Its P2002
    // would roll the whole decision back and 500 the webhook, so the decision is re-applied ONCE with
    // adoption switched off, which holds the rider for review instead of crashing.
    const adoption = { attempted: false };
    const decide = (adoptionBlocked: boolean) => this.svc.prisma.$transaction(async (tx) => {
      // D-75: a verified decision that carries the document number serializes on that number's advisory
      // lock — the SAME key the ID-writing routes take (completeProfile / auth.updateProfile) — before any
      // row lock or read. The collision counts and the adoption write below then see every concurrent
      // claimer of the number (another account showing the same document, the rider typing it in Account
      // mid-check) instead of racing it; and like those routes it is taken before any row lock, so two
      // claimers of one number queue on the lock rather than on each other's rows.
      const vendorHash = status === "verified" && verifiedDocNumber ? this.svc.pii.hashId(verifiedDocNumber) : null;
      if (vendorHash) await this.svc.lockNationalId(tx, vendorHash);
      // DOC-16-05: a `verified` outcome for a rider flagged `duplicateIdFlag` (A-04 — their national ID
      // collided with another account at onboarding, e.g. a banned/suspended one under a new SIM) must NOT
      // auto-verify while that other account is LIVE — that's exactly the auto-mode gap that let a
      // ban-evader re-registering with the same real ID/face sail straight through. Read the flag first
      // (kycRef is unique, so at most one row); the live re-count below decides (owner 2026-10-12: a flag
      // left by an erased tombstone alone is a returning user, who verifies). `failed`/`expired` outcomes
      // are unaffected — the flag only matters for the auto-APPROVE path.
      // DS18-04: row-lock the rider BEFORE the `current` read (mirrors adminSetKyc's `SELECT … FOR UPDATE`
      // below, and order-lifecycle.service's lockRiderRow). The `current` read is a plain unlocked select
      // whose kycAttempts value decides — in this transaction's `data` payload, before the updateMany runs —
      // whether an `expired` reset writes `kycAttempts:0`. The updateMany's WHERE only re-checks
      // kycRef + kycResolvedAt monotonicity at write time, never kycAttempts, so without this lock a
      // concurrent adminSetKyc second-decline (which takes the SAME `FOR UPDATE` lock) committing
      // kycAttempts=2 in the gap between this read and this write would reopen the exact DS17-03 lock-bypass
      // race: a later-timestamped `expired` webhook reads the pre-lock kycAttempts (< 2), decides to reset,
      // and silently wipes the admin's two-decline lock. Taking the lock here serializes this transaction
      // against that adminSetKyc transaction instead of racing it — the CAS updateMany WHERE below still
      // closes the independent replay/reorder race. kyc_ref is unique, so this locks at most one row.
      await tx.$executeRaw`SELECT 1 FROM riders WHERE kyc_ref = ${kycRef} FOR UPDATE`;
      // DS17-03: this read runs UNCONDITIONALLY now (previously only for `verified`) and also pulls
      // kycAttempts, because the `expired` branch below must know the rider's current lock state before it
      // resets the counter — an automated expiry webhook must not silently wipe the A-02 two-decline lock an
      // admin already applied. kycRef is unique, so at most one row. For verified/failed the extra
      // kycAttempts field is simply read and unused (a harmless no-op beyond the existing flag read).
      const current = await tx.rider.findFirst({
        where: { kycRef },
        select: {
          profileId: true,
          duplicateIdFlag: true,
          kycAttempts: true,
          // D-75: read under the row lock above, so it is exactly what the CAS update below will see.
          kycResolvedAt: true,
          // D-82 F6: an `expired` result keeps the document's own expiry day when it is the earlier one.
          kycIdExpiresOn: true,
          // KYC-R26-01 / -02: what the current check already resolved to, and who resolved it.
          kycStatus: true,
          kycVendorStatus: true,
          kycResolvedBy: true,
          profile: { select: { idNumberHash: true } },
        },
      });
      // KYC-R26-02: a HUMAN decision on this check is final against the vendor. adminSetKyc stamps kycResolvedAt
      // with OUR clock and keeps kycRef, so the monotonic guard alone let any later delivery for the same session
      // (a Didit reviewer's late verdict, a retry Didit re-signed with a fresh timestamp) overturn the
      // reviewer — re-verifying a rider ops had just declined, or the reverse. The check is read under the row
      // lock above, so no decision can land between it and the write. A fresh check (retryKyc mints a new
      // kycRef and clears kycResolvedBy) and an admin `pending` reset (which invites a vendor result and clears
      // it too) are applied normally.
      // The ID-expiry sweep (KYC-R26-08, `system`) is held to the same rule: a late Approved for the session
      // that verified the lapsed card must not re-verify it.
      if (current?.kycResolvedBy && current.kycResolvedBy !== KYC_RESOLVED_BY_VENDOR) {
        this.svc.logger.warn(`KYC ${kycRef}: vendor result (${status}) ignored — this check was decided by ${current.kycResolvedBy} (${current.kycStatus}) (KYC-R26-02)`);
        return { updated: 0, notifyProfileId: null, demotedProfileId: null, skipped: "admin_decided" as const };
      }
      // KYC-R26-01: a delivery carrying the outcome this check ALREADY resolved to is a repeat, not a new
      // decision. The monotonic guard can't see that: Didit re-signs every retry with a fresh body timestamp
      // (IR26-09), so a retried Declined looked newer than itself and re-incremented kycAttempts — two
      // deliveries of ONE decline hit the A-02 lock at 2 — and a retried Approved re-wrote the audit row and
      // re-sent the push. Like adminSetKyc's F-14, the same outcome on the same check (kycRef) is a no-op: no
      // counter, no audit, no push. A held verify (pending, resolved, vendor status Approved) counts as a
      // resolved `verified` here. A DIFFERENT outcome on the same check (Approved months later followed by
      // Kyc Expired, a Didit reviewer overturning a decline) still applies through the guard below.
      // KYC-R26-12: a verify the one-ID-one-account checks turned into a decline keeps Didit's Approved too,
      // so it reads as the vendor's `verified` here and a retried Approved is the same repeat.
      const resolvedOutcome =
        current?.kycResolvedAt == null
          ? null
          : current.kycStatus === "pending" || current.kycStatus === "failed"
            ? current.kycVendorStatus === DIDIT_APPROVED_STATUS
              ? "verified"
              : current.kycStatus === "failed"
                ? "failed"
                : // An unreadable card held for a person (owner 2026-10-15) resolved a Declined: a retried
                  // delivery of it is the same repeat, not a fourth unreadable decline.
                  current.kycVendorStatus === DIDIT_IN_REVIEW_STATUS
                  ? "failed"
                  : null
            : current.kycStatus;
      if (current && resolvedOutcome === status) {
        this.svc.logger.log(`KYC ${kycRef}: repeat delivery of the ${status} this check already resolved to — no-op (KYC-R26-01)`);
        return { updated: 0, notifyProfileId: null, demotedProfileId: null, skipped: "repeat" as const };
      }
      // IR26-04 vendor-document dedupe. The typed-ID gate (IR26-01) blocks reusing a number someone
      // TYPED — a ban-evader's remaining move is typing a DIFFERENT number while showing the same real
      // document to the vendor. When the decision payload exposes the verified document number, hash it
      // (pii.hashId normalizes punctuation/case, so it's directly comparable to Profile.idNumberHash)
      // and refuse to auto-verify when:
      //  - docMismatch: it doesn't match the national ID already on the account, OR
      //  - docCollision: it matches ANOTHER LIVE account's typed hash or vendor-verified hash.
      // Owner 2026-10-12: an erased tombstone is NOT a collision. Counting tombstones declined every
      // returning user as `duplicate` — a restricted account can't self-erase (DS15-02), so a tombstone
      // match is someone coming back to their own identity. It verifies, and its approval audit row is
      // flagged `verified_id_returning` (like `verified_id_missing`) so ops can see every one.
      // D-75 (owner 2026-10-03): an account with NO national ID on file has nothing to mismatch — new
      // riders no longer type one before the check, the check supplies it. (Before D-75 that account was
      // a legacy pre-IR26-02 rider and was held as a mismatch.) The vendor's number is adopted onto it
      // below; docCollision is the one-ID-one-account check against that number.
      // Absent doc number (null) → both false → exactly the pre-IR26-04 behavior for an account that has
      // an ID on file (D-75 verifies one that doesn't and audit-flags it — see `idMissing`). The raw number is never persisted
      // or logged — only the HMAC hash (LR8) and, for D-70/D-75, the AES-GCM ciphertext.
      const docHash = vendorHash && current ? vendorHash : null;
      const idOnFile = current?.profile?.idNumberHash ?? null;
      let docMismatch = false;
      let docCollision = false;
      // A match on an erased tombstone only (any > live): a returning user, verified and audit-flagged.
      let returningUser = false;
      if (docHash && current) {
        docMismatch = idOnFile !== null && idOnFile !== docHash;
        const live = await this.svc.verifiedIdCollisionCount(tx, current.profileId, docHash, "live");
        docCollision = live > 0;
        returningUser = !docCollision && (await this.svc.verifiedIdCollisionCount(tx, current.profileId, docHash, "any")) > 0;
        if (docMismatch || docCollision) {
          this.svc.logger.warn(
            `KYC ${kycRef}: vendor-verified document ${docMismatch ? "does not match the national ID on file" : ""}${docMismatch && docCollision ? " and " : ""}${docCollision ? "is on another live account" : ""} (IR26-04)`,
          );
        }
      } else if (status === "verified" && !verifiedDocNumber) {
        // Coverage signal, not an error: tells ops whether the Didit workflow/payload actually carries
        // document data (the extraction is fail-open by design — see extractDiditDocumentNumber).
        this.svc.logger.log(`KYC ${kycRef}: verified webhook carried no document number — vendor-doc dedupe skipped`);
      }
      // D-75: no national ID on file AND no document number in the decision leaves the one-ID-one-account
      // check nothing to run against. The extraction stays FAIL-OPEN, as extractDiditDocumentNumber
      // promises ("a verify is never held hostage to a field we couldn't find"): holding here would park
      // every new rider in review whenever the payload lacks the number, and a held rider's only way
      // forward is another paid session. The verify applies, and its approval audit row carries
      // `verified_id_missing` so ops can see and follow up on every rider verified without a number.
      const idMissing = status === "verified" && !!current && idOnFile === null && docHash === null;
      // DOC-16-05, re-counted (owner 2026-10-12): the A-04 flag was set at onboarding by ANY other account
      // holding the typed ID, erased tombstones included. It declines a verify only while one of them is still
      // LIVE (counted now, under the row lock); a flag left by tombstones alone is a returning user.
      let liveDuplicateFlag = false;
      if (status === "verified" && current?.duplicateIdFlag === true) {
        liveDuplicateFlag = idOnFile !== null && (await this.svc.liveDuplicateIdAccountCount(tx, current.profileId, idOnFile)) > 0;
        if (!liveDuplicateFlag) returningUser = true;
      }
      if (returningUser && !docCollision && !liveDuplicateFlag) {
        this.svc.logger.warn(`KYC ${kycRef}: the national ID is on an erased account only — a returning user, verified and audit-flagged verified_id_returning`);
      }
      // D-75: the vendor-verified number becomes the account's national ID when the account has none.
      const needsAdoption = status === "verified" && !!current && idOnFile === null && docHash !== null;
      // KYC-R26-14 (owner 2026-10-12): a document whose number differs from the national ID the account holds is
      // most often a typo in the number the rider typed, not a borrowed card — and the vendor has just verified
      // the card against their face. Declining that as `id_mismatch` (a strike) punished the typo. So the
      // DOCUMENT's number replaces the account's, exactly as D-75 adopts it onto an empty account, when that is
      // safe: no other LIVE account holds the number (no docCollision; an erased tombstone is a returning user),
      // the account's current ID isn't shared with a live account (liveDuplicateFlag), and the rider isn't
      // verified already (a verified ID is frozen, DS-11). Anything less keeps the KYC-R26-12 decline. The write
      // is adoptVerifiedId with a CAS on the OLD hash, under the document number's advisory lock taken above.
      const needsReplacement =
        status === "verified" && !!current && docMismatch && !docCollision && !liveDuplicateFlag && current.kycStatus !== "verified";
      // D-75 / KYC-R26-14: a re-run after the live-ID unique index (IR26-05) refused the adoption or replacement
      // — another live account holds the number after all — is a collision.
      const claimBlocked = adoptionBlocked && (needsAdoption || needsReplacement);
      let holdForReview =
        status === "verified" &&
        (liveDuplicateFlag || (docMismatch && !(needsReplacement && !adoptionBlocked)) || docCollision || claimBlocked);
      if (idMissing) {
        this.svc.logger.warn(`KYC ${kycRef}: verified with no national ID on file and no document number in the decision — verified, audit-flagged verified_id_missing (D-75)`);
      }
      // D-75 adoption: "the number is confirmed from the check afterwards". Only for a decision that will
      // VERIFY the rider in this transaction — not held, and newer than the last applied one (the same
      // predicate as the CAS `where` below, read under the row lock, so it can't change before that
      // write) — and only when nothing collides: `docCollision` is false, so no other LIVE profile carries
      // this number and the live-ID unique index (which leaves erased tombstones out) can't fire (the advisory
      // lock above keeps it that way until commit). The write itself is adoptVerifiedId, shared with a hand approval.
      // Its CAS never overwrites an ID that landed meanwhile (the rider adding one in Account mid-check
      // takes a different number's lock); a number that is not the document's is a mismatch, held like
      // any other.
      const decisionApplies = !!current && (current.kycResolvedAt == null || current.kycResolvedAt < eventAt);
      if (needsAdoption && !holdForReview && decisionApplies && current && verifiedDocNumber) {
        adoption.attempted = true;
        const adopted = await this.svc.adoptVerifiedId(tx, current.profileId, verifiedDocNumber);
        if (adopted === "adopted") {
          this.svc.logger.log(`KYC ${kycRef}: no national ID on file — adopted the vendor-verified number (D-75)`);
        } else if (adopted === "different") {
          docMismatch = true;
          holdForReview = true;
          this.svc.logger.warn(`KYC ${kycRef}: a national ID landed on the account during the check and does not match the document — held for review (D-75)`);
        }
      }
      // KYC-R26-14: the replacement. Same predicate as the adoption (verifies in this transaction, newer than the
      // last decision); `adoption.attempted` arms the same P2002 re-apply, which then declines it as a duplicate.
      // A lost CAS (the rider changed their ID mid-check) re-reads the slot: the document's number means there is
      // nothing left to mismatch; any other number is the KYC-R26-12 `id_mismatch` decline, as before.
      let idReplaced = false;
      if (needsReplacement && !holdForReview && decisionApplies && current && verifiedDocNumber && idOnFile) {
        adoption.attempted = true;
        const replaced = await this.svc.adoptVerifiedId(tx, current.profileId, verifiedDocNumber, idOnFile);
        if (replaced === "different") {
          holdForReview = true;
          this.svc.logger.warn(`KYC ${kycRef}: the national ID changed during the check and does not match the document — declined id_mismatch (KYC-R26-14)`);
        } else {
          docMismatch = false;
          idReplaced = replaced === "adopted";
          if (idReplaced) this.svc.logger.log(`KYC ${kycRef}: the national ID on file differed from the verified document — replaced with the document's number (KYC-R26-14)`);
        }
      }
      // KYC-R26-12 (owner 2026-10-12: "even the In Review to be fully automatic"): a verify that our own
      // one-ID-one-account checks refuse is DECLINED, not held for a human. A national ID already on another
      // account (duplicateIdFlag, a vendor-document collision, an adoption the live-ID index refused) is
      // `duplicate`; a document whose number differs from the account's national ID is `id_mismatch`. The
      // vendor-verified hash is still persisted below, so the next applicant showing this document collides
      // too. `kycVendorStatus` keeps Didit's Approved on such a decline: it is what the KYC-R26-01 repeat guard
      // reads to tell a retried Approved for this check from a new outcome (Didit re-signs retries with a
      // fresh timestamp), so a retry can't count as a second decline.
      const refusedVerify = holdForReview;
      const outcome: "verified" | "failed" | "expired" = refusedVerify ? "failed" : status;
      const outReason = refusedVerify ? (docMismatch && !claimBlocked ? KycDeclineReason.ID_MISMATCH : KycDeclineReason.DUPLICATE) : reason;
      if (refusedVerify) {
        holdForReview = false;
        this.svc.logger.warn(`KYC ${kycRef}: approved by the vendor, declined ${outReason} by the one-ID-one-account checks (KYC-R26-12)`);
      }
      // Owner 2026-10-15: a verify whose selfie couldn't be checked on the phone's camera carries the flag ops see.
      const selfieUnverified = outcome === "verified" && opts.selfieUnverified === true;
      // Owner 2026-10-15 (option 2): the card couldn't be read for the third time. Another retry on the same
      // camera won't read it either, so the check goes to a person instead of declining again: the biker waits on
      // the "under review" wall (pending, held — the stored In Review) and ops decide from the queue. Counted from
      // the webhook's own earlier `id_unreadable` declines of this biker, which the KYC-R26-13 daily cap reads too —
      // since the last clean slate only: a verify, a person's decision (approve / decline / expire / reset) or an
      // earlier hold. Unreadable cards months ago, before a verify and a lapsed ID, don't skip today's retakes.
      const unreadableHold =
        outcome === "failed" &&
        outReason === KycDeclineReason.ID_UNREADABLE &&
        !!current &&
        current.kycStatus === "pending" &&
        (await this.svc.unreadableDeclinesSinceCleanSlate(tx, current.profileId)) >= KYC_UNREADABLE_DECLINES_BEFORE_REVIEW;
      if (unreadableHold) {
        this.svc.logger.warn(`KYC ${kycRef}: the ID card couldn't be read again — held for a person instead of declined (owner 2026-10-15)`);
      }
      const res = await tx.rider.updateMany({
        where: { kycRef, OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }] },
        data: {
          // A flagged "verified" outcome does NOT flip kycStatus/idVerified — it stays `pending` so the
          // rider remains in the manual-review queue (admin.getKycReview) instead of going online on an
          // identity that already collides with another account. kycResolvedAt still advances (below) so
          // the same webhook delivery can't be reprocessed.
          // An unreadable card held for a person stays `pending` the same way (owner 2026-10-15).
          ...(holdForReview || unreadableHold ? {} : { kycStatus: outcome, idVerified: outcome === "verified" }),
          kycResolvedAt: eventAt,
          // KYC-R26-02: the vendor resolved this check (a hold too: it is the vendor's verdict we hold).
          kycResolvedBy: KYC_RESOLVED_BY_VENDOR,
          // R-3: a verify HELD for review stays `pending`, and with its credentials cleared below /auth/me
          // used to read it as "unfinished" — the rider was told to finish a check they had finished, and
          // a retry bought a fresh paid session. Record what the vendor said (it approved; WE hold), which
          // /auth/me reads as held → the "under review" wall. A decided check needs no vendor status.
          // An unreadable card held for a person records Didit's In Review, which /auth/me and the console read as
          // held (classifyStoredDiditStatus) — the "under review" wall, and retryKyc refuses a fresh paid check.
          ...(holdForReview || refusedVerify
            ? { kycVendorStatus: DIDIT_APPROVED_STATUS, kycVendorStatusAt: eventAt }
            : unreadableHold
              ? { kycVendorStatus: DIDIT_IN_REVIEW_STATUS, kycVendorStatusAt: eventAt }
              : { kycVendorStatus: null, kycVendorStatusAt: null }),
          // Owner 2026-10-15: the selfie flag rides every verify — set when the selfie couldn't be checked on the
          // phone's camera, cleared by a verify whose selfie passed (a re-check's leftovers go with it).
          ...(outcome === "verified"
            ? selfieUnverified
              ? { selfieCheck: SELFIE_CHECK_UNVERIFIED, selfieCheckReason: SELFIE_CAMERA_QUALITY, selfieCheckAt: eventAt, selfieRecheckRef: null, selfieRecheckUrl: null }
              : { selfieCheck: null, selfieCheckReason: null, selfieCheckAt: null, selfieRecheckRef: null, selfieRecheckUrl: null }
            : {}),
          // The session token dies with the decision it belonged to. Every outcome that reaches here is
          // terminal for THAT session — Didit will not reopen an Approved/Declined/Expired one — so
          // keeping the credential would leave a verified rider carrying a live secret for no reason,
          // and would let retryKyc hand back a token the SDK can only reject.
          //
          // E2E 2026-10-05 FS-11: but NOT on the hold-for-review path. A held rider is still `pending`,
          // and only our own review is outstanding; they owe nothing. Clearing the credentials there made
          // getProfile answer `unfinished` ("Finish verifying") and retryKyc mint a fresh PAID session for
          // a check that had already finished. Kept, the rider reads exactly like a Didit In Review hold
          // (recordHeldVerifiedId, which never touches them either): the vendor reports the decided
          // session, mapDiditPendingState says `in_flight`, and a retry resumes it for free. The review's
          // own decision (adminSetKyc, every branch) clears them.
          ...(holdForReview ? {} : { kycSessionToken: null, kycSessionUrl: null }),
          // IR26-04: persist the vendor-verified document hash EVEN when holding for review — a later
          // applicant presenting the same physical document must collide with this row too, and the
          // admin review screen surfaces the mismatch/collision from it.
          // D-70 "Didit ID prefill": the verified number itself, ENCRYPTED (never plaintext, never
          // logged), written with its hash so /auth/me can hand it back to its owner to prefill the
          // national-ID field. Normalised like a typed ID (normalizeNationalId) so it round-trips
          // through completeProfile unchanged.
          ...(docHash && verifiedDocNumber
            ? { verifiedIdHash: docHash, verifiedIdNumber: this.svc.pii.encryptId(normalizeNationalId(verifiedDocNumber)) }
            : {}),
          // Record the auto-decline reason (Didit score below the threshold) so the rider app can show
          // why, and clear any stale reason on a verify/expiry (unchanged for `expired`; a flagged
          // `verified` held for review isn't a resolved decision yet, so its stale decline reason, if
          // any, is deliberately left in place rather than cleared).
          ...(outcome === "failed" ? { kycDeclineReason: outReason ?? null } : holdForReview ? {} : { kycDeclineReason: null }),
          // F-13: a vendor DECLINE bumps the A-02 attempt counter too, so the auto path throttles retries
          // exactly like the manual admin decline does — without this, auto-mode retries were uncapped,
          // each minting a fresh paid vendor session. The increment rides the SAME monotonic guard as the
          // rest of this updateMany (kycRef + kycResolvedAt null/older than eventAt): a webhook REPLAY or
          // out-of-order delivery matches 0 rows (an exact replay has the same eventAt → not `lt` → no
          // match), so it can't double-count. Only a genuinely new decline on a fresh ref (retryKyc mints
          // a new kycRef and clears kycResolvedAt) increments again → the second decline locks at >= 2.
          //
          // KYC-R26-13 (owner 2026-10-12): but only a decline that is evidence about the identity costs a strike.
          // KYC_DECLINE_CLASS (@lynia/shared) decides: `strike` (tampering, spoofing, a duplicate, a name or ID
          // number that isn't the account's) +1 as above; `final` (under age) locks at once — max(n, 2), never
          // lowering a count; `fixable` (blurry, face not matched, expired card, unexplained) costs nothing,
          // bounded instead by retryKyc's daily cap (assertUnderKycDailyLimit). The KYC-R26-01 repeat guard above
          // still turns a retried delivery into a no-op before any of this. A human decline (adminSetKyc) is not
          // classified: it always counts one.
          ...(outcome === "failed" ? declineAttemptsWrite(outReason, current?.kycAttempts ?? 0) : {}),
          // An expiry (1·b2) is not a decline: reset the A-02 attempt counter so re-verification isn't
          // trapped by an ancient decline the rider already recovered from before they were verified.
          // DS17-03: but ONLY when the rider isn't already locked (kycAttempts < 2). A stale vendor session
          // timing out and firing `expired` AFTER an admin's second decline must not silently wipe the
          // permanent two-decline lock (retryKyc's A-02 gate) — that would hand a locked applicant a third
          // attempt. An admin choosing to reset the lock goes through adminSetKyc (a `pending` reset with
          // `resetAttempts`, or the manual expire path) — a deliberate human decision with its own reset.
          ...(outcome === "expired" && (current?.kycAttempts ?? 0) < 2 ? { kycAttempts: 0 } : {}),
          // Standing-demotion (Class-B sibling of BR-01/DS15-05): a rider verified+online at the moment
          // their KYC lapses to failed/expired can no longer bid (onlineRefusalReason gates on
          // kyc=verified), so leaving them isOnline:true keeps them counted in the customer-facing
          // ridersNearby supply and still receiving broadcasts/board pushes. Force offline in the same
          // write; the post-commit evictRiderFromSupply below clears the Redis geo index + board rooms.
          // (verified/holdForReview never demote — they don't set this.)
          ...(outcome === "failed" || outcome === "expired" ? { isOnline: false } : {}),
          // First Run v2 F6 (D-82 §4): the ID's expiry day — the document's, from a verified decision that
          // carries it; on an expiry, the day it lapsed (or the document's day when that is earlier).
          ...(outcome === "verified" && documentExpiresOn ? { kycIdExpiresOn: documentExpiresOn } : {}),
          // KYC-R26-08: an expired-document decline records the day the document expired, for the decline copy.
          ...(expiredDocument && documentExpiresOn ? { kycIdExpiresOn: documentExpiresOn } : {}),
          ...(outcome === "expired" ? { kycIdExpiresOn: kycIdExpiryOnLapse(current?.kycIdExpiresOn, eventAt) } : {}),
        },
      });
      // Only when the update actually applied (res.count > 0 — not a stale/replayed webhook). `expired`
      // is handled by its own re-verify prompt; a `holdForReview` verify isn't a decision the rider app
      // should be told about yet (it's still pending), so it gets its own audit action + no push, while a
      // genuine verified/failed outcome keeps the existing feed-sync + notify behavior. kycRef is unique
      // → at most one rider.
      let resolvedProfileId: string | null = null;
      // Admin console v2 §3: the rider this decision landed on, for its `kyc.attempt` event below.
      let attemptProfileId: string | null = null;
      if (res.count > 0 && unreadableHold && current) {
        // Not a `rider.kyc_decline`: nothing was declined, and that row is what the next count reads. No push —
        // the biker is in the app, on the wall that says a person is checking.
        attemptProfileId = current.profileId;
        await tx.auditLog.create({
          data: auditData(KYC_WEBHOOK_ACTOR, "rider.kyc_review_required", current.profileId, "id_unreadable_repeated", null),
        });
      } else if (res.count > 0 && holdForReview) {
        const rider = await tx.rider.findFirst({ where: { kycRef }, select: { profileId: true } });
        attemptProfileId = rider?.profileId ?? null;
        if (rider) {
          // The audit reason names every condition that held the verify (IR26-04 widened this beyond
          // the original duplicate_id_flag), so the review trail says WHY without exposing any hash.
          // D-75: a re-run after the live-ID unique index refused the adoption is a collision too.
          const holdReason = [
            liveDuplicateFlag ? "duplicate_id_flag" : null,
            docMismatch ? "verified_id_mismatch" : null,
            docCollision || (needsAdoption && adoptionBlocked) ? "verified_id_collision" : null,
          ]
            .filter(Boolean)
            .join("+");
          await tx.auditLog.create({
            data: auditData(KYC_WEBHOOK_ACTOR, "rider.kyc_review_required", rider.profileId, holdReason, null),
          });
        }
        // No notifyProfileId: the rider isn't told anything changed — they're still `pending`, same as
        // before this webhook arrived, until a human resolves the flag via adminSetKyc.
      } else if (res.count > 0 && (outcome === "verified" || outcome === "failed") && !unreadableHold) {
        const rider = await tx.rider.findFirst({ where: { kycRef }, select: { profileId: true } });
        if (rider) {
          // KB-FEED-SYNTH: the AUTOMATED vendor path must ALSO write an AuditLog row (only the manual
          // adminSetKyc path did), so feedForUser can synthesize an account-status feed row uniformly.
          // Reuse the SAME action strings as adminSetKyc (rider.kyc_approve / rider.kyc_decline), but
          // mark the actor as automated ("system:kyc-webhook") so admin audit views can still tell manual
          // from automated decisions. Same transaction as the status write — never one without the other.
          const action = outcome === "verified" ? "rider.kyc_approve" : "rider.kyc_decline";
          // D-75: an approval with no number to dedupe on is flagged here rather than held (see idMissing).
          // KYC-R26-14: a verify that replaced the account's national ID says so (no number, no hash — PII stays out).
          // Owner 2026-10-12: a verify whose ID matched only an erased tombstone says so (`verified_id_returning`).
          const verifyFlags = [
            idReplaced ? "verified_id_replaced" : null,
            returningUser ? "verified_id_returning" : null,
            idMissing ? "verified_id_missing" : null,
            // Owner 2026-10-15: ops can find every biker verified without a checked selfie.
            selfieUnverified ? "selfie_unverified" : null,
          ]
            .filter(Boolean)
            .join("+");
          const auditReason = outReason ?? (outcome === "verified" && verifyFlags ? verifyFlags : null);
          await tx.auditLog.create({
            data: auditData(KYC_WEBHOOK_ACTOR, action, rider.profileId, auditReason, null),
          });
          resolvedProfileId = rider.profileId;
          attemptProfileId = rider.profileId;
        }
      }
      // Class-B eviction: a lapse (failed/expired) that actually applied needs the profileId post-commit
      // so we can pull the (now non-verified) rider out of the live-supply planes. `failed` already has it
      // (resolvedProfileId); `expired` never fetched it (it takes no verified/failed branch), so fetch here.
      let demotedId: string | null = outcome === "failed" && !unreadableHold ? resolvedProfileId : null;
      if (res.count > 0 && outcome === "expired") {
        const rider = await tx.rider.findFirst({ where: { kycRef }, select: { profileId: true } });
        demotedId = rider?.profileId ?? null;
        attemptProfileId = demotedId;
      }
      // Admin console v2 §3: one `kyc.attempt` per applied vendor decision, in the decision's transaction (a
      // replay matched 0 rows above and records nothing). No session ref in the event: it is erasable PII.
      if (res.count > 0 && attemptProfileId) {
        await domainEvents.record(tx, {
          type: "kyc.attempt",
          actorRole: "system",
          subjectType: "rider",
          subjectId: attemptProfileId,
          data: {
            vendorStatus: vendorOutcome,
            decision: holdForReview || unreadableHold ? "held_for_review" : outcome,
            reason: outReason ?? null,
            resolvedBy: "vendor",
          },
        });
        // Only a rider who was verified could have been online; a pending check that fails was never on the road.
        if ((outcome === "failed" || outcome === "expired") && current?.kycStatus === "verified") {
          await domainEvents.riderOffline(tx, attemptProfileId, outcome === "expired" ? "id_expired" : "kyc_change");
        }
      }
      // A decline that leaves the rider LOCKED (the A-02 counter at 2 after declineAttemptsWrite, or the `final`
      // class — under age) is told so: "try again" would send them at a wall.
      const declineClass = outcome === "failed" ? kycDeclineClass(outReason) : null;
      const lockedAfter =
        declineClass !== null && (declineClass === "final" || (current?.kycAttempts ?? 0) + (declineClass === "strike" ? 1 : 0) >= 2);
      return { updated: res.count, notifyProfileId: resolvedProfileId, demotedProfileId: demotedId, skipped: undefined, outcome, lockedAfter };
    });
    let decided: Awaited<ReturnType<typeof decide>>;
    try {
      decided = await decide(false);
    } catch (err) {
      // Only the adoption write can raise a unique violation here (IR26-05's live-ID index); anything
      // else — and a P2002 from anywhere before the adoption started — propagates unchanged.
      if (!(adoption.attempted && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      this.svc.logger.warn(`KYC ${kycRef}: the verified ID number is already on another live account — decision re-applied, held for review (D-75)`);
      decided = await decide(true);
    }
    if (decided.skipped) return { updated: 0, skipped: decided.skipped };
    const { updated, notifyProfileId, demotedProfileId, outcome, lockedAfter } = decided;
    // R-4: the session is decided (or held); nothing cached about it as "in progress" may outlive that.
    if (updated > 0) this.svc.pendingStates?.invalidate(kycRef);
    // Class-B sibling of BR-01/DS15-05: a KYC lapse pulled the rider offline in PG above; now evict them
    // from the board rooms + `rider:geo` Redis index through the standing-demotion funnel, exactly as
    // suspend/ban/auto-hold do. Best-effort, post-commit; never throws, never affects the committed write.
    if (demotedProfileId) void this.svc.gateway.evictRiderFromSupply(demotedProfileId);
    // Best-effort, post-commit: tell the rider their ID check resolved (nothing surfaced this before). A
    // notify miss can NEVER affect the committed KYC write above (notifyKycDecision is fire-and-forget).
    // notifyProfileId is set only for a committed verified/failed decision.
    // KYC-R26-12: the OUTCOME, not the vendor's status — a verify the one-ID-one-account checks declined is told
    // it was declined, never "You're verified". A decline that locked them gets F5's copy, not "try again".
    if (notifyProfileId && (outcome === "verified" || outcome === "failed")) {
      void this.svc.notifyKycDecision(notifyProfileId, outcome === "failed" && lockedAfter ? "locked" : outcome);
    }
    // Didit's Kyc Expired: F6's push, like the ID-expiry sweep and an ops expire.
    if (updated > 0 && outcome === "expired" && demotedProfileId) void this.svc.notifyKycDecision(demotedProfileId, "expired");
    return { updated };
  }

  /**
   * D-75 item 2 (IR26-09): the webhook HOLDS some results for a human (`pending`): Didit's In Review, and
   * since IR26-07 a Didit approval whose face match falls in the review band (isDiditReviewHold). Those still
   * carry the number Didit read from the document. Store it on the rider, as a resolved decision does
   * (`verifiedIdHash`, and `verifiedIdNumber` encrypted and normalised like a typed ID), so the reviewer sees
   * it and a hand approval adopts it (settleNationalIdOnApproval). A band-held approval is final at Didit,
   * so without this no later webhook ever brings the number.
   *
   * That is the only write. The decision is not resolved, so kycStatus, idVerified and kycResolvedAt keep
   * their values, nothing is adopted onto the profile, and no audit row or notification is written. The
   * number reaches the rider's own app only once they are verified (`/auth/me` kycIdNumber).
   *
   * Only while the rider's CURRENT check (`kycRef`) is undecided: `pending`, with no kycResolvedAt. Every
   * decision that resolves a check stamps kycResolvedAt: the webhook's, a verify it holds for review (which
   * stores its own number), and a hand approval, decline or expiry (a `pending` reset resolves nothing). So a
   * held result never overwrites the number a resolved decision wrote, in whatever order the deliveries
   * arrive. It is deliberately not the
   * event-time comparison applyKycResult makes. The only time a webhook carries is when Didit dispatched
   * it (body `timestamp`), and Didit re-signs a retry with a fresh one, so a retried held result can look
   * newer than the decision that followed it; a hand decision's kycResolvedAt is our clock, not Didit's.
   * A check retryKyc replaced, and an erased account (erasure nulls kycRef), match no row.
   *
   * IR26-04: the stored hash makes a later applicant showing the same document collide, as the
   * verified-but-held path does on purpose. So the write takes the number's advisory lock first, like every
   * writer of a national ID, and a collision count another claimer takes under that lock sees it or waits.
   */
  async recordHeldVerifiedId(kycRef: string, verifiedDocNumber: string): Promise<{ updated: number }> {
    const verifiedIdHash = this.svc.pii.hashId(verifiedDocNumber);
    const res = await this.svc.prisma.$transaction(async (tx) => {
      await this.svc.lockNationalId(tx, verifiedIdHash);
      return tx.rider.updateMany({
        where: { kycRef, kycStatus: "pending", kycResolvedAt: null },
        data: { verifiedIdHash, verifiedIdNumber: this.svc.pii.encryptId(normalizeNationalId(verifiedDocNumber)) },
      });
    });
    if (res.count > 0) {
      this.svc.logger.log(`KYC ${kycRef}: held for review — stored the number the check read, for the reviewer and a hand approval (D-75)`);
    }
    return { updated: res.count };
  }

  /**
   * Best-effort push telling a rider their KYC standing changed → route to their rider home (`/rider`, kind
   * `account`). `data.kyc` names the variant (verified | failed | locked | expired | reset) so the app can tell
   * them apart; the copy is KYC_PUSH_COPY (First Run v2 `KY`, verbatim). Fire-and-forget (notifyProfiles never
   * throws); a notification miss can't affect the KYC write.
   *
   * But it is never SILENT: a push that reached no device of the rider (no registered token, or every send
   * refused) is counted (`push_undelivered_total{kind="account"}`) and logged, so a rider who never hears
   * their outcome is visible. Resolves to whether it was delivered (for tests; callers don't wait).
   */
  notifyKycDecision(profileId: string, variant: KycPushVariant): Promise<boolean> {
    if (variant === "verified") void this.svc.notifyFleetInviteWaiting(profileId);
    return this.svc.notifications
      .notifyProfiles([profileId], { ...KYC_PUSH_COPY[variant], data: { kind: "account", kyc: variant } })
      .then((delivered) => {
        if (delivered?.has(profileId)) return true;
        this.svc.metrics?.incPushUndelivered("account");
        this.svc.logger.warn(`KYC ${variant} push for biker ${profileId} reached no device (push_undelivered_total)`);
        return false;
      })
      .catch(() => false);
  }

  /**
   * Own bikers OB-R2 (D-117): an invited biker whose ID check just passed can join now — "Chicken Inn Avondale is
   * waiting for you" (the drawn notification has no second line), opening the board where the Join card is. One
   * push for the newest live invite to their number. Best-effort, like the KYC push it follows.
   */
  async notifyFleetInviteWaiting(profileId: string): Promise<void> {
    try {
      const profile = await this.svc.prisma.profile.findUnique({ where: { id: profileId }, select: { phone: true } });
      if (!profile?.phone) return;
      const invite = await this.svc.prisma.fleetInvite.findFirst({
        where: { phone: profile.phone, revokedAt: null, joinedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { homeMerchantId: true },
      });
      if (!invite) return;
      const shop = await this.svc.prisma.merchant.findUnique({ where: { id: invite.homeMerchantId }, select: { name: true } });
      if (!shop) return;
      await this.svc.notifications.notifyProfiles([profileId], { title: `${shop.name} is waiting for you`, body: "", data: { kind: "fleet_invite" } });
    } catch {
      /* best-effort */
    }
  }

  /**
   * D-75: before a hand approval takes the rider row lock, find the number it may adopt (the account has
   * no national ID and the ID check verified one) and take that number's advisory lock. The approval then
   * queues behind the number's other claimers in the order they all lock. Returns the locked hash, or
   * null when there is nothing to adopt and nothing was locked. This read takes no lock;
   * settleNationalIdOnApproval re-reads under the row lock and refuses when the number moved.
   */
  async lockIdForApproval(tx: Prisma.TransactionClient, profileId: string): Promise<string | null> {
    const found = await tx.rider.findUnique({
      where: { profileId },
      select: { verifiedIdHash: true, profile: { select: { idNumberHash: true } } },
    });
    const hash = found && !found.profile?.idNumberHash ? (found.verifiedIdHash ?? null) : null;
    if (hash) await this.svc.lockNationalId(tx, hash);
    return hash;
  }

  /**
   * D-75 for a hand approval (an admin's, and so every approval in manual mode): settle the account's
   * national ID as a verified webhook does, before the approval writes. Returns what the approval leaves
   * on file:
   *  - `on_file`: the account already had a national ID. Nothing changes, exactly as before D-75; the
   *    review screen flags one that disagrees with the check (IR26-04);
   *  - `adopted`: it had none, and the number the ID check verified is now its national ID. The webhook's
   *    guards apply: the number's advisory lock, the collision count on both hash axes, the CAS on an
   *    empty slot, and the unique-index backstop (mapped by adminSetKyc);
   *  - `missing`: it had none, and there is no vendor number to adopt (manual mode, a decision that
   *    carried none, or a number since scrubbed). The approval goes ahead, as the webhook's fail-open
   *    does, and its audit row is flagged.
   *
   * It throws a 409 the console shows, instead of approving with nothing adopted:
   *  - `verified_id_in_use` when the number is on another LIVE account. An erased tombstone does not
   *    refuse: the webhook holds such a match precisely so that a human can approve a returning user, and
   *    this is that human (liveDuplicateIdAccountCount draws the same line);
   *  - `review_stale` when the ID facts moved during the approval: the number is not the one locked
   *    before the row lock, or a different national ID landed on the account.
   */
  async settleNationalIdOnApproval(
    tx: Prisma.TransactionClient,
    rider: {
      profileId: string;
      verifiedIdHash: string | null;
      verifiedIdNumber: string | null;
      profile: { idNumberHash: string | null } | null;
    },
    lockedIdHash: string | null,
    adoption: { attempted: boolean },
  ): Promise<{ outcome: "on_file" | "missing" } | { outcome: "adopted"; duplicateIdFlag: boolean }> {
    const onFile = rider.profile?.idNumberHash ?? null;
    if (onFile) {
      // An ID that landed after the read that took the lock, and is not the number locked, is something
      // the reviewer hasn't seen: an IR26-04 mismatch.
      if (lockedIdHash && onFile !== lockedIdHash) throw reviewStale();
      return { outcome: "on_file" };
    }
    const hash = rider.verifiedIdHash ?? null;
    if (!hash) return { outcome: "missing" };
    if (hash !== lockedIdHash) throw reviewStale();
    if ((await this.svc.verifiedIdCollisionCount(tx, rider.profileId, hash, "live")) > 0) {
      this.svc.logger.warn(`Biker ${rider.profileId}: approval refused — the vendor-verified number is on another live account (D-75)`);
      throw verifiedIdInUse();
    }
    // Erasure scrubs the encrypted number and keeps its hash (DS15-02b), and a decision from before D-70
    // stored only the hash. Either way there is nothing to write, so the account stays without an ID.
    const number = this.svc.pii.decryptId(rider.verifiedIdNumber);
    if (!number) return { outcome: "missing" };
    // One decision writes the number and its hash together. Never adopt a number other than the one just
    // locked and counted.
    if (this.svc.pii.hashId(number) !== hash) {
      throw new InternalServerErrorException("The ID check's stored number doesn't match its fingerprint. Approval stopped; contact engineering.");
    }
    adoption.attempted = true;
    const adopted = await this.svc.adoptVerifiedId(tx, rider.profileId, number);
    if (adopted === "different") throw reviewStale();
    if (adopted === "same") return { outcome: "on_file" };
    this.svc.logger.log(`Biker ${rider.profileId}: no national ID on file — the approval adopted the vendor-verified number (D-75)`);
    // IR26-03 parity: an ID write recomputes the A-04 reviewer flag. Only an erased tombstone can still
    // carry this number; a live one was refused above.
    const others = await tx.profile.count({ where: { idNumberHash: hash, id: { not: rider.profileId } } });
    return { outcome: "adopted", duplicateIdFlag: others > 0 };
  }

  /**
   * Admin KYC decision write-back (A-02 state machine) + manual-review backstop (T7).
   *
   * - **approve** (`verified`) → rider can go online; clear any prior decline reason. D-75: an account
   *   with no national ID adopts the number its ID check verified, as a verified webhook does (a 409 when
   *   that number is on another live account), and an approval with no number to adopt is audit-flagged
   *   `verified_id_missing`. See settleNationalIdOnApproval.
   * - **decline** (`failed`) → record the `reasonCode` (surfaced to the rider app + the audit log) and
   *   increment `kycAttempts`. The second decline pushes the counter to >= 2, which locks resubmission
   *   in `retryKyc` (one resubmit allowed → then support).
   * - `pending` is the plain backstop reset (no counter change) — unless `resetAttempts` (owner 2026-10-12):
   *   then the A-02 counter goes back to 0 and the decline reason is cleared in the same write, so a LOCKED
   *   rider can retry again (retryKyc's 403 lifts). Audited as `rider.kyc_reset` with reason `attempts_reset`.
   *
   * Every outcome the rider must act on is pushed (KYC_PUSH_COPY): verified, declined (or `locked` when the
   * decline used the last try), expired, and a reset ("Finish your ID check").
   *
   * `locked` is returned so the console can reflect the terminal state immediately without re-reading.
   *
   * A-01: the decision and its audit row commit in ONE transaction (the KYC path was previously the sole
   * console action whose audit row was a separate, non-atomic POST — a failed decision could leave an
   * audit row for a decision that never took effect). `actor` is the forwarded operator; `note` is the
   * optional ConfirmModal free-text.
   */
  async adminSetKyc(
    profileId: string,
    status: Kyc,
    reasonCode?: string | null,
    actor?: string,
    note?: string | null,
    opts: { resetAttempts?: boolean } = {},
  ): Promise<{ profileId: string; kycStatus: Kyc; kycAttempts: number; locked: boolean }> {
    if (opts.resetAttempts && status !== "pending") {
      throw new BadRequestException("Attempts can only be reset with a pending reset.");
    }
    const resetAttempts = status === "pending" && opts.resetAttempts === true;
    // verified → approve, failed → decline, expired → expire (1·b2 ops backstop), pending → reset
    // (matches the ConfirmModal action names).
    const action =
      status === "verified"
        ? "rider.kyc_approve"
        : status === "failed"
          ? "rider.kyc_decline"
          : status === "expired"
            ? "rider.kyc_expire"
            : "rider.kyc_reset";

    // D-75: an approval may write the profile (it adopts the vendor-verified number). The live-ID unique
    // index can still refuse that write; this records that it was attempted, so only THAT P2002 becomes
    // the operator-facing 409 below.
    const adoption = { attempted: false };
    const decision = await this.svc.prisma.$transaction(async (tx) => {
      // D-75: the number an approval may adopt is locked like every other claimer of it: its advisory
      // lock is taken before the row lock below, the order the webhook and the ID-writing routes use.
      const lockedIdHash = status === "verified" ? await this.svc.lockIdForApproval(tx, profileId) : null;
      // Row-lock the rider before the read (mirrors order-lifecycle.service's lockRiderRow). The
      // findUnique below takes no lock on its own, so a concurrent vendor-webhook decline
      // (applyKycResult, which bumps kycAttempts) landing between this read and the update would let one
      // logical decline be double-counted — over-locking an honest rider. Taking `FOR UPDATE` here makes
      // the webhook's own write serialize against this transaction instead of interleaving with it.
      await tx.$executeRaw`SELECT 1 FROM riders WHERE profile_id = ${profileId}::uuid FOR UPDATE`;
      const rider = await tx.rider.findUnique({
        where: { profileId },
        select: {
          profileId: true,
          kycAttempts: true,
          kycStatus: true,
          kycResolvedAt: true,
          // D-82 F6: a manual expire keeps the document's own expiry day when it is the earlier one.
          kycIdExpiresOn: true,
          // D-75: what an approval settles the national ID from.
          verifiedIdHash: true,
          verifiedIdNumber: true,
          profile: { select: { idNumberHash: true } },
        },
      });
      if (!rider) throw new NotFoundException("Biker not found");
      // D-75: an approval settles the national ID first (adopts, or refuses with a 409). Every other
      // decision leaves the profile alone.
      const nationalId = status === "verified" ? await this.svc.settleNationalIdOnApproval(tx, rider, lockedIdHash, adoption) : null;

      let result: { profileId: string; kycStatus: Kyc; kycAttempts: number; locked: boolean };
      if (status === "failed") {
        // Decline: record the reason and bump the attempt counter. The increment is the lock's source of
        // truth — a second decline lands at >= 2 and retryKyc refuses to mint a third session.
        //
        // F-14: the counter must not double-count the SAME logical decline. A decline whose HTTP response
        // was lost and retried (the console re-submitting the identical action) finds the rider already
        // sitting in a resolved `failed` state — that's a repeat, not a new attempt, so it must not
        // re-increment (it would over-lock an honest rider). A genuine SECOND decline only happens after
        // the rider RESUBMITTED, which retryKyc signals by leaving `failed` and clearing kycResolvedAt —
        // so guard the increment on "not already a resolved failure". The reason/audit is still re-recorded
        // on every call; only the counter is guarded.
        const isRepeatOfSameDecline = rider.kycStatus === "failed" && rider.kycResolvedAt != null;
        const updated = await tx.rider.update({
          where: { profileId },
          data: {
            kycStatus: "failed",
            idVerified: false,
            kycDeclineReason: reasonCode ?? null,
            // Terminal human decision — the session it belonged to is spent. Same reasoning as the
            // webhook path: a declined rider must not carry a live credential, and retryKyc must mint
            // rather than hand back a token that can only be rejected.
            kycSessionToken: null,
            kycSessionUrl: null,
            kycVendorStatus: null,
            kycVendorStatusAt: null,
            ...(isRepeatOfSameDecline ? {} : { kycAttempts: { increment: 1 } }),
            // Stamp the resolution time so applyKycResult's monotonic guard treats this human decision
            // as the latest word: a later (or replayed) vendor webhook with an older eventAt can no
            // longer flip a manually-declined rider back to verified. retryKyc clears it on a genuine
            // resubmit, so a fresh vendor result still resolves.
            kycResolvedAt: new Date(),
            // KYC-R26-02: and mark it a HUMAN decision, which applyKycResult will not overturn for this check.
            kycResolvedBy: KYC_RESOLVED_BY_ADMIN,
            // Class-B demotion: a decline pulls the rider out of good standing, so force offline in the
            // same write (mirrors the webhook path); post-commit evictRiderFromSupply clears geo/board.
            isOnline: false,
          },
          select: { kycAttempts: true },
        });
        result = { profileId, kycStatus: "failed", kycAttempts: updated.kycAttempts, locked: updated.kycAttempts >= 2 };
      } else {
        // Approve / pending reset: no counter change. Clearing the decline reason on approve keeps the
        // rider app from showing a stale "you were declined for …" once they're verified.
        await tx.rider.update({
          where: { profileId },
          data: {
            kycStatus: status,
            idVerified: status === "verified",
            // Cleared on every branch here, including a `pending` RESET. A reset is an invitation for a
            // FRESH vendor result, so leaving the old session's token attached would let retryKyc resume
            // the very check the admin just set aside.
            kycSessionToken: null,
            kycSessionUrl: null,
            // R-3: and the vendor status that session left behind — a reset held rider must read
            // "unfinished" (start a fresh check), not stay on the under-review wall.
            kycVendorStatus: null,
            kycVendorStatusAt: null,
            // A manual APPROVE is a terminal human decision: stamp kycResolvedAt so a later/replayed
            // vendor webhook can't override it (mirrors the decline path). A `pending` RESET is
            // deliberately inviting a fresh vendor result, so it leaves kycResolvedAt untouched.
            ...(status === "verified" ? { kycDeclineReason: null, kycResolvedAt: new Date() } : {}),
            // KYC-R26-02: approve and expire are HUMAN decisions the vendor can't overturn on this check; a
            // `pending` reset invites a fresh vendor result, so it hands the check back (null).
            kycResolvedBy: status === "pending" ? null : KYC_RESOLVED_BY_ADMIN,
            // A manual EXPIRE (1·b2 ops backstop) is also terminal: stamp the time, clear any stale
            // decline reason, and reset the A-02 counter so re-verification isn't blocked by an old lock.
            ...(status === "expired"
              ? { kycDeclineReason: null, kycResolvedAt: new Date(), kycAttempts: 0, kycIdExpiresOn: kycIdExpiryOnLapse(rider.kycIdExpiresOn, new Date()) }
              : {}),
            // Class-B demotion: any transition OUT of verified (expired, or a `pending` reset) means the
            // rider can no longer bid (onlineRefusalReason gates on verified), so pull them offline in the
            // same write. A verified APPROVE is the one status that keeps them online-eligible.
            ...(status === "verified" ? {} : { isOnline: false }),
            // D-75 (IR26-03 parity): an adopted ID recomputes the A-04 reviewer flag, as every ID write does.
            ...(nationalId?.outcome === "adopted" ? { duplicateIdFlag: nationalId.duplicateIdFlag } : {}),
            // Owner 2026-10-12: a reset that gives the rider their tries back, in this same write.
            ...(resetAttempts ? { kycAttempts: 0, kycDeclineReason: null } : {}),
          },
        });
        const nextAttempts = status === "expired" || resetAttempts ? 0 : rider.kycAttempts;
        result = { profileId, kycStatus: status, kycAttempts: nextAttempts, locked: nextAttempts >= 2 };
      }

      // Same transaction as the decision — never one without the other. `actor` is absent only in older
      // callers/tests; skip the row then rather than attribute the action to no one.
      if (actor) {
        // D-75: an approval that leaves the account with no national ID is flagged `verified_id_missing`,
        // exactly as the webhook's is, so ops can follow up every rider verified without one.
        const auditReason =
          reasonCode ?? (nationalId?.outcome === "missing" ? "verified_id_missing" : resetAttempts ? "attempts_reset" : null);
        await tx.auditLog.create({ data: auditData(actor, action, profileId, auditReason, note ?? null) });
      }
      // Admin console v2 §3: the human decision as a `kyc.attempt`, in the decision's transaction.
      await domainEvents.record(tx, {
        type: "kyc.attempt",
        actorId: actor ?? null,
        actorRole: "admin",
        subjectType: "rider",
        subjectId: profileId,
        data: {
          decision: status === "pending" ? "reset" : status,
          reason: reasonCode ?? null,
          resolvedBy: "admin",
          ...(resetAttempts ? { attemptsReset: true } : {}),
        },
      });
      if (status !== "verified" && rider.kycStatus === "verified") {
        await domainEvents.riderOffline(tx, profileId, "kyc_change", { actorId: actor ?? null, actorRole: "admin" });
      }
      return result;
    }).catch((err: unknown) => {
      // IR26-05: the live-ID unique index refusing the adoption (a writer that skipped the advisory lock
      // claimed the number between the count and the write) rolls the whole approval back, and the
      // operator gets the collision count's answer. Anything else, including a P2002 raised before the
      // adoption, propagates unchanged.
      if (adoption.attempted && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        this.svc.logger.warn(`Biker ${profileId}: approval refused — the live-ID unique index rejected the vendor-verified number (D-75)`);
        throw verifiedIdInUse();
      }
      throw err;
    });
    // Class-B eviction: any non-verified decision pulled the rider offline above (isOnline:false); evict
    // them from the board rooms + geo index through the standing-demotion funnel too. Best-effort,
    // post-commit; a verified approve is the one outcome that keeps them online-eligible, so no eviction.
    if (decision.kycStatus !== "verified") void this.svc.gateway.evictRiderFromSupply(profileId);
    // Best-effort, post-commit: mirror the vendor-webhook path — tell the rider a manual decision changed their
    // standing. A second decline is the lock (F5's copy, not "try again"); an expiry is F6's; a `pending` reset
    // is "Finish your ID check" — each is something the rider now has to act on, so none is silent any more.
    const variant: KycPushVariant =
      decision.kycStatus === "failed" ? (decision.locked ? "locked" : "failed") : decision.kycStatus === "pending" ? "reset" : decision.kycStatus;
    void this.svc.notifyKycDecision(profileId, variant);
    return decision;
  }
}
