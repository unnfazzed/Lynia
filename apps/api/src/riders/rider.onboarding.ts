/**
 * A biker's profile and becoming a biker, with the national-ID collision checks. A part of RiderService
 * (R-6): `this.svc` is the service itself.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, type Role } from "@prisma/client";
import { DEFAULT_COUNTRY_CODE, normalizeNationalId } from "@lynia/shared";
import { isOwnedUploadKey } from "../adapters/storage/upload-kinds";
import type { Env } from "../config/env";
import { type KycVendor } from "../kyc/kyc-vendor";
import { auditData } from "../admin/admin.shared";
import { domainEvents } from "../common/domain-events";
import { ownerAlertText } from "../owner-alerts/owner-alerts.service";
import { type Kyc } from "./rider.helpers";
import type { RiderHost } from "./rider.host";

export class RiderOnboarding {
  constructor(private readonly svc: RiderHost) {}
  /**
   * How many OTHER accounts (INCLUDING erased tombstones — DS15-02b keeps their hash) carry this
   * national ID. This is the A-04 REVIEWER signal: it feeds `duplicateIdFlag`, which survives for
   * legacy pre-policy rows and for erased-tombstone matches (a returning user re-registering). It no
   * longer decides anything on its own: applyKycResult re-counts LIVE accounts before it declines a
   * flagged rider as `duplicate`, and a tombstone-only match verifies, audit-flagged
   * `verified_id_returning` (owner 2026-10-12). The hard BLOCK lives in
   * {@link RiderService.liveDuplicateIdAccountCount} — live collisions are refused outright since the
   * 2026-07-26 one-ID-one-account rule. Returns 0 for a missing ID (nothing to collide on).
   */
  async duplicateIdAccountCount(profileId: string, idNumberHash: string | null | undefined): Promise<number> {
    if (!idNumberHash) return 0;
    // Match on the HMAC hash, never the raw (now-encrypted) id_number (LR8).
    return this.svc.prisma.profile.count({ where: { idNumberHash, id: { not: profileId } } });
  }

  /**
   * How many OTHER **live** accounts carry this national ID — the gate for the one-ID-one-account
   * rule (user decision 2026-07-26, supersedes flag-only A-04 for live accounts): an ID may sit on at
   * most one live profile, so the ID-writing paths and `becomeRider` refuse a collision here with a
   * 409 `id_in_use`. Erased tombstones (phone `erased:<id>`) are EXCLUDED: a restricted account can't
   * self-erase (DS15-02 standing gate), so a tombstone match is a legitimate returning user who must
   * not be locked out of their own identity — they're still flagged for the KYC reviewer via
   * {@link RiderService.duplicateIdAccountCount}. Takes the client so ID-writing callers count inside
   * their transaction, under the same-ID advisory lock that serializes concurrent claimers.
   */
  async liveDuplicateIdAccountCount(db: Prisma.TransactionClient, profileId: string, idNumberHash: string): Promise<number> {
    return db.profile.count({
      where: { idNumberHash, id: { not: profileId }, NOT: { phone: { startsWith: "erased:" } } },
    });
  }

  /**
   * A national ID's advisory lock: `pg_advisory_xact_lock(hashtext(<HMAC hash>))`, the key
   * `completeProfile` and `auth.updateProfile` take before they claim a number. Every writer of one
   * number queues on it, so a collision count taken under it can't be raced: those routes, the KYC
   * webhook and a hand approval (D-75). Take it before any row lock, as they all do.
   */
  async lockNationalId(tx: Prisma.TransactionClient, idNumberHash: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idNumberHash}))`;
  }

  /**
   * IR26-04 / D-75: how many OTHER accounts already carry this vendor-verified number, either as the
   * national ID on their profile (typed, or adopted from a check) or as another rider's vendor-verified
   * document. `any` counts erased tombstones too (DS15-02b keeps both hashes). `live` leaves them out: it
   * is the one-ID-one-account test both decisions apply. The webhook declines a LIVE collision as
   * `duplicate` and lets a tombstone-only match (`any` > `live`) verify as a returning user, audit-flagged
   * `verified_id_returning` (owner 2026-10-12); a hand approval refuses a live collision with a 409 (see
   * liveDuplicateIdAccountCount).
   */
  async verifiedIdCollisionCount(
    db: Prisma.TransactionClient,
    profileId: string,
    hash: string,
    scope: "any" | "live",
  ): Promise<number> {
    const live = { NOT: { phone: { startsWith: "erased:" } } };
    const [profileHits, riderHits] = await Promise.all([
      db.profile.count({ where: { idNumberHash: hash, id: { not: profileId }, ...(scope === "live" ? live : {}) } }),
      db.rider.count({ where: { verifiedIdHash: hash, profileId: { not: profileId }, ...(scope === "live" ? { profile: live } : {}) } }),
    ]);
    return profileHits + riderHits;
  }

  /**
   * D-75: make the vendor-verified number the account's national ID when it has none. Shared by the two
   * decisions that can verify a rider: the KYC webhook (`applyKycResult`) and a hand approval
   * (`adminSetKyc`). It uses the same normalisation, AES-GCM encryption and HMAC hash as a typed ID.
   *
   * The write is a CAS on an EMPTY slot (`idNumberHash: null`), so it never overwrites an ID that landed
   * meanwhile. A lost CAS re-reads the slot:
   *  - `adopted`: the slot was empty and now holds the number;
   *  - `same`: an ID landed meanwhile, and it is this number;
   *  - `different`: an ID landed meanwhile, and it is another number. The webhook holds that as a
   *    mismatch; an approval refuses it.
   *
   * The caller must already hold the number's advisory lock (lockNationalId, taken before its row lock)
   * and have run the collision count in the same transaction. The live-ID unique index (IR26-05) stays
   * the backstop for a writer that skips the lock: its P2002 aborts the caller's transaction, and each
   * caller maps it.
   *
   * KYC-R26-14: `replacing` is the hash of a national ID the account DOES hold, which the webhook replaces with
   * the document's number (applyKycResult). The CAS is then on that hash instead of the empty slot, so an ID
   * the rider changed meanwhile is never overwritten: the lost CAS re-reads the slot exactly as above.
   */
  async adoptVerifiedId(
    tx: Prisma.TransactionClient,
    profileId: string,
    verifiedNumber: string,
    replacing: string | null = null,
  ): Promise<"adopted" | "same" | "different"> {
    const idNumberHash = this.svc.pii.hashId(verifiedNumber);
    const adopted = await tx.profile.updateMany({
      where: { id: profileId, idNumberHash: replacing },
      data: { idNumber: this.svc.pii.encryptId(normalizeNationalId(verifiedNumber)), idNumberHash },
    });
    if (adopted.count > 0) return "adopted";
    const onFile = await tx.profile.findUnique({ where: { id: profileId }, select: { idNumberHash: true } });
    return onFile?.idNumberHash === idNumberHash ? "same" : "different";
  }

  /** Low-friction signup completion: name + national ID (CONCEPT §5d). */
  async completeProfile(
    profileId: string,
    data: { firstName: string; lastName: string; idNumber: string },
  ): Promise<{ ok: true }> {
    // Store the national ID encrypted at rest + its dedup hash (LR8); never the raw number.
    const idNumberHash = this.svc.pii.hashId(data.idNumber);

    // DS-11 hardening (mirrors auth.service.updateProfile / PATCH /auth/me): a KYC-VERIFIED rider must
    // not silently swap the national ID that was verified — it undermines KYC and is the ban-evasion
    // laundering path (become clean → later switch to the real, colliding ID through whichever endpoint
    // lacks the check). This sibling route previously had NO equivalent guard, so it was an integrity
    // bypass of the freeze. Block a genuine CHANGE (new hash ≠ stored hash) once verified; a real
    // correction goes through support/admin. Same condition + exception as the auth route so both
    // ID-writing endpoints enforce the freeze identically.
    const existing = await this.svc.prisma.profile.findUnique({
      where: { id: profileId },
      select: { idNumberHash: true, rider: { select: { kycStatus: true } } },
    });
    if (existing?.rider?.kycStatus === "verified" && existing.idNumberHash && existing.idNumberHash !== idNumberHash) {
      throw new ForbiddenException("Your ID is locked after verification — contact support to change it.");
    }

    try {
      await this.svc.prisma.$transaction(async (tx) => {
        // One-ID-one-account (2026-07-26): when this write CLAIMS an ID the profile doesn't already hold
        // (stored hash ≠ incoming — a resend of the caller's own ID makes no new claim and must stay
        // idempotent, incl. for legacy pre-policy duplicates), refuse if another LIVE account carries it.
        // The advisory xact lock serializes concurrent claimers of the SAME hash across both ID-writing
        // routes (here + auth.updateProfile), closing the count-then-write race — two parallel signups
        // typing one ID can't both pass the count. Erased tombstones don't block (returning user; see
        // liveDuplicateIdAccountCount) but still set the reviewer flag below.
        if (existing?.idNumberHash !== idNumberHash) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idNumberHash}))`;
          if ((await this.svc.liveDuplicateIdAccountCount(tx, profileId, idNumberHash)) > 0) {
            this.svc.logger.warn(`Profile ${profileId} refused a national ID already on another live account (one-ID-one-account)`);
            throw new ConflictException({
              reason: "id_in_use",
              message: "This national ID is already linked to another account. Contact support if it's yours.",
            });
          }
        }

        // The pre-check above is check-then-write: the KYC webhook (applyKycResult) can commit `verified`
        // between that read and this write, so an iteration that observed a non-verified status can still
        // land a new ID after the freeze took effect. Make the ID-writing update a CAS that re-asserts the
        // freeze atomically — it matches only when the rider is NOT (verified AND actually changing the ID),
        // i.e. the exact condition the pre-check gates on, evaluated at write time. A re-send of the SAME id
        // (idNumberHash unchanged) or a not-yet-verified rider still writes; a genuine change against a
        // now-verified rider matches 0 rows → the same "ID frozen" error.
        const written = await tx.profile.updateMany({
          where: {
            id: profileId,
            NOT: { AND: [{ rider: { kycStatus: "verified" } }, { idNumberHash: { not: idNumberHash } }] },
          },
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            idNumber: this.svc.pii.encryptId(data.idNumber),
            idNumberHash,
          },
        });
        if (written.count === 0) {
          throw new ForbiddenException("Your ID is locked after verification — contact support to change it.");
        }
        // A-04 reviewer signal (DS-11 parity — auth.updateProfile already recomputes; this sibling route
        // previously only logged). After the live-block above, a surviving collision is an erased tombstone
        // (returning user) or a legacy pre-policy duplicate. Persist it on the rider row in the same tx —
        // a no-op for a not-yet-rider caller (becomeRider snapshots the flag at onboarding instead). We
        // don't tell the applicant: surfacing the FLAG would only coach a ban-evader to change the ID.
        const dupCount = await tx.profile.count({ where: { idNumberHash, id: { not: profileId } } });
        await tx.rider.updateMany({ where: { profileId }, data: { duplicateIdFlag: dupCount > 0 } });
        if (dupCount > 0) {
          this.svc.logger.warn(`Profile ${profileId} completed signup with a national ID already on another (erased/legacy) account (A-04)`);
        }
        });
    } catch (err) {
      // IR26-05: the partial unique index on live id_number_hash (migration 0039) is the DB-level
      // backstop behind the advisory-locked count above — if a bypassing write path ever races this
      // one, the index P2002s; surface it as the same 409 the in-app check raises, not a raw 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException({
          reason: "id_in_use",
          message: "This national ID is already linked to another account. Contact support if it's yours.",
        });
      }
      throw err;
    }
    return { ok: true };
  }

  /** Upgrade a customer to a rider; submit to KYC (auto) or leave pending for review (manual). */
  async becomeRider(
    profileId: string,
    data: { bikeReg?: string; photoUrl?: string },
  ): Promise<{ kycStatus: Kyc; mode: Env["KYC_MODE"]; verificationUrl?: string; sessionToken?: string }> {
    const existing = await this.svc.prisma.rider.findUnique({
      where: { profileId },
      select: { profileId: true },
    });
    // BH-04: structured `reason` (not just a plain message) so the client can special-case this
    // exact conflict — it's the expected shape of a lost-response retry (the FIRST submit landed
    // server-side, the rider only saw the dropped/timed-out response) rather than a generic error.
    // KYC-R26-10: when that first submit's session is live, the repeat gets IT back instead (the lost
    // response it is retrying), so the check opens without a second paid session or a detour via the board.
    if (existing) {
      const replay = await this.svc.liveSessionReplay(profileId);
      if (replay) return replay;
      throw new ConflictException({ reason: "already_rider", message: "Already registered as a biker" });
    }

    // The photo key must live under this caller's own KYC namespace — POST /uploads/kyc-photo mints
    // keys as `kyc/<callerId>/<uuid>` — so a rider can't persist a key that points at another user's
    // KYC object (harmless until the reviewer console mints a signed read URL from the stored key).
    // The photo itself is optional (owner 2026-10-02): sign-up no longer asks for it; when a client sends
    // one, it is still checked here.
    // D7 review: directly in the caller's own namespace AND free of `..`/`//`/`%` — a prefix match alone let
    // `kyc/<me>/../../<victim>` through, which the Azure SDK resolves to the victim's blob.
    if (data.photoUrl !== undefined && !isOwnedUploadKey("kyc", profileId, data.photoUrl)) {
      throw new BadRequestException("Invalid photo key");
    }

    // D-75 (owner 2026-10-03): a national ID is NOT required to start. New riders no longer type one
    // before the ID check — the number is confirmed from the check afterwards (Calm Mint v2 §5 "Didit
    // ID prefill"): applyKycResult adopts the vendor-verified number onto the profile, and runs the
    // one-ID-one-account dedupe against THAT number before it verifies anyone (a live collision declines
    // `duplicate`, KYC-R26-12). So an ID-less signup is deduped after the check rather than before it. A
    // decision that carries no number at all still verifies (the extraction is fail-open), and its
    // approval audit row carries `verified_id_missing` so ops can follow every such rider up.
    //
    // One-ID-one-account guard (2026-07-26, supersedes the flag-only A-04 for LIVE accounts), for an
    // account that already carries a typed ID (added in Account, or a pre-D-75 sign-up): refuse one
    // that's already on another live account. Erased tombstones don't block (a restricted account can't
    // self-erase — DS15-02 — so a tombstone match is a legitimate returning user); they still set the
    // reviewer flag below, which admin.getKycReview recomputes live. applyKycResult re-counts LIVE
    // accounts for a flagged rider: a live match declines, a tombstone-only one verifies, audit-flagged
    // `verified_id_returning`. Both checks run BEFORE vendor.submit so a refused signup never bills a
    // paid Didit session.
    const profile = await this.svc.prisma.profile.findUnique({
      where: { id: profileId },
      // role: what a failed vendor call restores when it hands the rider claim back (KYC-R26-10), and
      // the admin refusal below. firstName: the blank-name refusal below.
      select: { idNumberHash: true, firstName: true, role: true, phone: true },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    const previousRole = profile.role;
    // Customers and merchants may sign up on any country's number (owner 2026-10-19, diaspora sign-up);
    // bikers ride in Zimbabwe and are paid through EcoCash/InnBucks, so a biker account needs a +263
    // number. The role is unknown when the OTP is sent, so this is the gate. Refused before vendor.submit.
    if (!profile.phone.startsWith(`+${DEFAULT_COUNTRY_CODE}`)) {
      throw new ForbiddenException({ reason: "phone_country", message: "Biking needs a Zimbabwe number (+263)." });
    }
    // An admin account must never become a rider: the role flip below would replace `admin` with
    // `rider`, and the console session dies on its next refresh. Merchant staff are left alone — merchant
    // access reads `merchantMemberships`, not `role`. Refused before vendor.submit, so it bills nothing.
    if (profile.role === "admin") {
      throw new ForbiddenException({ reason: "role_not_allowed", message: "This account can't become a biker." });
    }
    // R1 asks a nameless account for its name before the check (C5's name step), so a blank name here
    // is a client that skipped it — refuse rather than create a rider the board and the customer's
    // tracking card would show with no name.
    if (!profile.firstName.trim()) {
      throw new BadRequestException({ reason: "name_required", message: "Add your name before you start your ID check." });
    }
    if (profile.idNumberHash && (await this.svc.liveDuplicateIdAccountCount(this.svc.prisma, profileId, profile.idNumberHash)) > 0) {
      this.svc.logger.warn(`Biker ${profileId} blocked from onboarding: national ID already on another live account (one-ID-one-account)`);
      throw new ConflictException({
        reason: "id_in_use",
        message: "This national ID is already linked to another account. Contact support if it's yours.",
      });
    }
    // C1/E8: the photo must really be there, in budget, and really a JPEG/PNG before it is recorded (an
    // Azure SAS binds neither type nor size). Runs after the namespace check above — a rejection deletes
    // the object — and before vendor.submit, so a bad photo never bills a paid Didit session.
    if (data.photoUrl !== undefined) await this.svc.uploads?.verify(data.photoUrl, "kyc");

    const duplicateIdFlag = (await this.svc.duplicateIdAccountCount(profileId, profile.idNumberHash)) > 0;
    if (duplicateIdFlag) {
      this.svc.logger.warn(`Biker ${profileId} onboarding with a national ID on another erased/legacy account — flagged for KYC review (A-04)`);
    }

    // QA/test: the stub provider has no real vendor and never calls back, so in auto mode it
    // acts as an instant pass — the rider is created already verified and can go online, making
    // the full rider flow (online → bid → deliver → OTP) testable with no Didit account. A real
    // provider (didit) still starts pending and is resolved by the vendor callback or the admin
    // backstop. Flip KYC_PROVIDER=didit before launch (see docs/AZURE-OWNER-RUNBOOK.md §8).
    const stubAutoPass = this.svc.env.KYC_PROVIDER === "stub" && this.svc.env.KYC_MODE === "auto";
    const initialKyc: Kyc = stubAutoPass ? "verified" : "pending";

    // KYC-R26-10: CLAIM the rider row BEFORE the paid vendor call, not after it. The row used to be created
    // only once vendor.submit() returned, so two near-simultaneous submits (a double tap, a client retry
    // racing a slow first response) both passed the findUnique pre-check above and BOTH bought a Didit
    // session; the loser's P2002 came after its money was spent. Now the (profileId) primary key is the claim
    // (DS13-06's guard, moved ahead of the spend): exactly one caller creates the row, and only that caller
    // mints. The loser reuses the winner's session when it is already stored, else gets the same
    // `already_rider` the app treats as "the first submit won — go to the board", where the stored session
    // is resumed for free (retryKyc). The row starts with no session; it is attached below.
    try {
      await this.svc.prisma.$transaction([
        this.svc.prisma.profile.update({ where: { id: profileId }, data: { role: "rider" } }),
        this.svc.prisma.rider.create({
          data: {
            profileId,
            bikeReg: data.bikeReg || null,
            photoUrl: data.photoUrl ?? null,
            kycStatus: initialKyc,
            idVerified: stubAutoPass,
            kycRef: null,
            kycSessionToken: null,
            kycSessionUrl: null,
            duplicateIdFlag,
          },
        }),
        // The biker's own record that they signed up, in the same commit as the claim (actor = themselves,
        // as rider.profile_update). The reason says whether the account carried a typed national ID.
        this.svc.prisma.auditLog.create({ data: auditData(profileId, "rider.become", profileId, profile.idNumberHash ? "id_on_file" : "no_id", null) }),
        // Admin console v2 §3: the biker funnel's "become biker" step, in the claim's own commit.
        ...domainEvents.batchOps(this.svc.prisma, {
          type: "rider.onboarding_step",
          actorId: profileId,
          actorRole: "rider",
          subjectType: "rider",
          subjectId: profileId,
          data: { step: "become", kyc: initialKyc },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // R-10: the SAME structured reason as the pre-check above. The loser of a double-tap race lands
        // here, and the app special-cases `already_rider` (the first submit won — go to the board); a
        // bare message left that rider on R1 with a toast. KYC-R26-10: a winner that already stored its
        // session hands it to the loser too, so both taps open the same check.
        const replay = await this.svc.liveSessionReplay(profileId);
        if (replay) return replay;
        throw new ConflictException({ reason: "already_rider", message: "You're already a biker" });
      }
      throw err;
    }

    // The owner hears once the application stands: here in manual mode, after the vendor accepted it in
    // auto mode (a failed submit hands the claim back above, and the biker's retry is the application).
    const announce = () => this.svc.ownerAlerts?.notify(ownerAlertText.bikerApplication({ firstName: profile.firstName, kycStatus: initialKyc }));
    if (this.svc.env.KYC_MODE !== "auto") {
      announce();
      return { kycStatus: initialKyc, mode: this.svc.env.KYC_MODE, verificationUrl: undefined };
    }

    // SECRET, captured here or never — Didit hands `session_token` back only from session-create, so
    // a token dropped on this path means every later resume mints a fresh paid session (P0-2 / D7).
    let submission: Awaited<ReturnType<KycVendor["submit"]>>;
    try {
      submission = await this.svc.vendor.submit(profileId);
    } catch (err) {
      // A vendor outage must surface as a retryable 503, not an unhandled 500 — and the claimed row is
      // handed back, so a failed submit leaves no half-onboarded rider behind (the next tap claims afresh).
      this.svc.logger.error(`KYC submit failed for ${profileId}: ${err instanceof Error ? err.message : String(err)}`);
      await this.svc.releaseRiderClaim(profileId, previousRole);
      throw new ServiceUnavailableException("Couldn't start ID verification. Please try again.");
    }
    await this.svc.recordKycSessionMinted(profileId, "become");
    announce();
    // Attach the session to the row this call claimed — only while the row still has none, so nothing that
    // landed meanwhile is overwritten. Only ever a still-pending session: the stub auto-pass lands `verified`
    // immediately, and a verified rider must carry no live credential.
    const attached = await this.svc.prisma.rider.updateMany({
      where: { profileId, kycRef: null },
      data: {
        kycRef: submission.ref,
        kycSessionToken: stubAutoPass ? null : (submission.token ?? null),
        kycSessionUrl: stubAutoPass ? null : (submission.url ?? null),
      },
    });
    if (attached.count === 0) {
      // Something else put a session on the row while this one was being created (a retry from another
      // device). Theirs is the live one; this one is spent but unused — say so, for the vendor bill.
      this.svc.logger.warn(`Biker ${profileId}: KYC session ${submission.ref} minted but not attached — the row already had one (KYC-R26-10)`);
      const replay = await this.svc.liveSessionReplay(profileId);
      if (replay) return replay;
    }
    return {
      kycStatus: initialKyc,
      mode: this.svc.env.KYC_MODE,
      verificationUrl: submission.url,
      sessionToken: stubAutoPass ? undefined : submission.token,
    };
  }

  /**
   * KYC-R26-10: the live session of a rider whose become-rider already ran, as become-rider's own answer — or
   * null when there is none to hand back (not pending, manual mode, or the session isn't attached yet). Lets a
   * repeated submit OPEN the check the first one bought instead of buying another. Only ever the caller's own
   * row (keyed by their profileId), and the same two credentials getMe / retryKyc already hand to its owner.
   */
  async liveSessionReplay(
    profileId: string,
  ): Promise<{ kycStatus: Kyc; mode: Env["KYC_MODE"]; verificationUrl?: string; sessionToken?: string } | null> {
    if (this.svc.env.KYC_MODE !== "auto") return null;
    const row = await this.svc.prisma.rider.findUnique({
      where: { profileId },
      select: { kycStatus: true, kycRef: true, kycSessionToken: true, kycSessionUrl: true },
    });
    if (!row || row.kycStatus !== "pending" || !row.kycRef || !row.kycSessionToken || !row.kycSessionUrl) return null;
    return { kycStatus: "pending", mode: this.svc.env.KYC_MODE, verificationUrl: row.kycSessionUrl, sessionToken: row.kycSessionToken };
  }

  /**
   * KYC-R26-10: undo becomeRider's claim when the vendor call it authorised failed — the row it created (no
   * session, nothing else references it yet) and the role flip. Guarded on `kycRef: null` so a row that got a
   * session meanwhile is never removed. Best-effort and never throws: it runs on the error path, and the
   * vendor failure is the error worth reporting. A release that fails leaves a pending rider with no session,
   * which the board's "Finish verifying" (retryKyc) mints for — degraded, not stuck.
   */
  async releaseRiderClaim(profileId: string, previousRole: Role | null | undefined): Promise<void> {
    try {
      // One transaction: a delete that committed without the role restore left a `rider`-role customer with
      // no rider row (the app routed them to a board that 403s), and the reverse can't happen at all now.
      await this.svc.prisma.$transaction(async (tx) => {
        const removed = await tx.rider.deleteMany({ where: { profileId, kycRef: null } });
        if (removed.count > 0) {
          await tx.profile.update({
            where: { id: profileId },
            data: { role: previousRole ?? "customer" },
          });
        }
      });
    } catch (err) {
      this.svc.logger.warn(`Couldn't release the biker claim for ${profileId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
