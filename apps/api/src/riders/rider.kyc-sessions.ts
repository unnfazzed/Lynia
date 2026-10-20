/**
 * KYC sessions: minting and its limits, retries, selfie re-checks, vendor status, reconciliation and ID
 * expiry. A part of RiderService (R-6): `this.svc` is the service itself.
 */
import { ConflictException, ForbiddenException, HttpException, HttpStatus, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { KycDeclineReason } from "@lynia/shared";
import type { Env } from "../config/env";
import { type KycVendor } from "../kyc/kyc-vendor";
import { classifyStoredDiditStatus, DIDIT_DEAD_STATUSES_NORMALISED, kycIdExpiryOnLapse } from "../kyc/didit";
import { type KycMintPath } from "../observability/metrics.service";
import { auditData } from "../admin/admin.shared";
import { domainEvents } from "../common/domain-events";
import { FIXABLE_DECLINE_REASONS, FORCED_KYC_REPLACEMENT_WINDOW_MS, KYC_DAILY_FIXABLE_DECLINE_LIMIT, KYC_DAILY_LIMIT_WINDOW_MS, KYC_ID_EXPIRY_ACTOR, KYC_MINT_CLAIM_PREFIX, KYC_MINT_CLAIM_TTL_MS, KYC_PAID_MINT_LIMIT, KYC_PAID_MINT_WINDOW_MS, KYC_RESOLVED_BY_SYSTEM, KYC_WEBHOOK_ACTOR, type Kyc, SELFIE_CHECK_RECHECK_REQUESTED, SELFIE_RECHECK_DAILY_LIMIT, kycInProgress, mintClaimAt } from "./rider.helpers";
import type { RiderHost } from "./rider.host";

export class RiderKycSessions {
  constructor(private readonly svc: RiderHost) {}
  /**
   * Re-run KYC for an existing rider whose check is pending or failed. RESUMES the live session when
   * there is one (free), and only mints a fresh — paid — session when there isn't. Verified riders are
   * left untouched.
   *
   * WHY RESUME EXISTS (P0-2 / gap G5). This used to call `vendor.submit()` unconditionally, so every
   * "Finish verifying" tap burned a Didit session. That is the whole cost of the rider-facing resume
   * button: a rider who backs out of the SDK at step one and taps again should re-enter the SAME check,
   * not buy a new one. The 5/hour throttle on the route capped the bleed; it never stopped it.
   *
   * NOTHING HERE TOUCHES `kycAttempts` (owner decision D4). The A-02 counter is incremented in exactly
   * one place — `applyKycResult` on a vendor `failed` decision — because it counts DECLINES, evidence
   * about the rider's identity. A retry is not a decline: an SDK that never opened (camera blocked, no
   * network) tells us nothing about their ID, and counting it would let a broken phone burn both
   * attempts and land the rider in the support queue having never been assessed. The regression test
   * pins this; see rider.service.spec.ts.
   */
  /**
   * Try to claim this rider's one forced KYC session replacement for the current window.
   *
   * Returns true only if the claim was won, and winning it is what authorises spending a paid vendor
   * session — so the claim happens BEFORE `vendor.submit()`, never after. A post-hoc check would let
   * two concurrent forced requests both pay and only then discover one of them should not have.
   *
   * Atomic by construction: the predicate (never forced, or forced longer ago than the window) and the
   * write are one conditional UPDATE, so exactly one of N racing callers can see `count === 1`.
   *
   * One per window is the right budget because a genuine expiry needs exactly ONE replacement. If the
   * replacement is also rejected, the session is not the problem and buying more will not fix it; the
   * rider lands on `cant_start`, whose second action is support.
   */
  async claimForcedKycReplacement(
    profileId: string,
    observed: { kycRef: string | null; kycStatus: Kyc; kycAttempts: number },
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - FORCED_KYC_REPLACEMENT_WINDOW_MS);
    const claimed = await this.svc.prisma.rider.updateMany({
      where: {
        profileId,
        // CAS on the snapshot retryKyc read, for the same reason the rotation below does it: the
        // findUnique takes no row lock, so a terminal webhook (applyKycResult) or an admin decision
        // can land in between. Without these, that race wins the claim and pays for a session the
        // rotation CAS then refuses to store — a burnt credit for a rider who is already resolved.
        kycRef: observed.kycRef,
        kycStatus: observed.kycStatus,
        kycAttempts: observed.kycAttempts,
        OR: [{ kycForcedAt: null }, { kycForcedAt: { lt: cutoff } }],
      },
      data: { kycForcedAt: new Date() },
    });
    return claimed.count === 1;
  }

  /**
   * Hand back a claim that bought nothing.
   *
   * The claim is taken BEFORE `vendor.submit()` so a lost race never pays — but that means a vendor
   * that then rejects leaves the rider holding a spent claim and no replacement session. Every later
   * tap would fall through to the resume path and re-open the very token the SDK already rejected,
   * for a whole window. That is the trap `force` exists to escape, so the claim is released whenever
   * the spend it authorised did not happen.
   *
   * Best-effort and never throws: it runs on an error path, and the vendor failure is the error worth
   * reporting. A release that itself fails costs the rider one window, not correctness.
   */
  async releaseForcedKycReplacement(profileId: string, previous: Date | null): Promise<void> {
    try {
      await this.svc.prisma.rider.updateMany({ where: { profileId }, data: { kycForcedAt: previous } });
    } catch (err) {
      this.svc.logger.warn(`Couldn't release forced KYC claim for ${profileId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * KYC-R26-13: refuse a fresh PAID session for a rider whose fixable vendor declines (KYC_DECLINE_CLASS) in the
   * last day reached KYC_DAILY_FIXABLE_DECLINE_LIMIT. Those declines cost no strike any more, so without this
   * nothing but the route's 5/hour throttle bounded what they spend. Counted from the audit rows the webhook
   * writes in the same transaction as each decision (applyKycResult: `rider.kyc_decline`, actor
   * `system:kyc-webhook`, target the profile, reasonCode the decline key; null — an unexplained decline — is
   * fixable too), so a replayed webhook, which writes nothing, can't inflate it. Human declines (adminSetKyc)
   * are not counted: they cost a strike instead. The free resume path never reaches here.
   *
   * Refused with the throttle's own status and shape (429 `{ statusCode, message }`, throttle.guard), plus a
   * distinct machine `reason`, so the app's one rate-limit toast (KYC_RETRY_TRY_LATER) covers it unchanged and
   * a newer client can still tell the two apart.
   */
  async assertUnderKycDailyLimit(profileId: string): Promise<void> {
    const since = new Date(Date.now() - KYC_DAILY_LIMIT_WINDOW_MS);
    const fixableDeclines = await this.svc.prisma.auditLog.count({
      where: {
        actor: KYC_WEBHOOK_ACTOR,
        action: "rider.kyc_decline",
        target: profileId,
        createdAt: { gte: since },
        OR: [{ reasonCode: { in: FIXABLE_DECLINE_REASONS } }, { reasonCode: null }],
      },
    });
    if (fixableDeclines >= KYC_DAILY_FIXABLE_DECLINE_LIMIT) {
      this.svc.logger.warn(`KYC retry for ${profileId} refused: ${fixableDeclines} fixable declines in the last 24h (KYC-R26-13)`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          reason: "kyc_daily_limit",
          message: "You've tried the ID check a few times today. Please try again tomorrow.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Refuse a fresh PAID session once this biker bought {@link KYC_PAID_MINT_LIMIT} in the last hour — counted
   * from the `rider.kyc_session_minted` rows {@link recordKycSessionMinted} writes, so only a session we paid
   * for counts (a vendor 503, a free resume, a refused request cost nothing). Same 429 shape as the throttle
   * and the daily cap, so the app's one "try again later" toast covers it.
   */
  async assertUnderPaidMintLimit(profileId: string): Promise<void> {
    const minted = await this.svc.prisma.auditLog.count({
      where: { action: "rider.kyc_session_minted", target: profileId, createdAt: { gte: new Date(Date.now() - KYC_PAID_MINT_WINDOW_MS) } },
    });
    if (minted >= KYC_PAID_MINT_LIMIT) {
      this.svc.logger.warn(`KYC retry for ${profileId} refused: ${minted} paid sessions in the last hour`);
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS, reason: "kyc_mint_limit", message: "Too many requests — try again later" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * One PAID Didit session was minted (vendor.submit succeeded): the `rider.kyc_session_minted` audit row (the
   * vendor bill per biker, and what assertUnderPaidMintLimit counts) and the `kyc_session_minted_total` metric.
   * The row carries the path only — never the session ref's token. Best-effort: the session is already paid
   * for, so a failed write is logged, never surfaced to the rider.
   */
  async recordKycSessionMinted(profileId: string, path: KycMintPath): Promise<void> {
    this.svc.metrics?.incKycSessionMinted(path);
    try {
      await this.svc.prisma.auditLog.create({ data: auditData(profileId, "rider.kyc_session_minted", profileId, path, null) });
    } catch (err) {
      this.svc.logger.warn(`Couldn't record the KYC session minted for ${profileId}: ${err instanceof Error ? err.message : String(err)}`);
    }
    // A selfie re-check is a verified biker's, not an onboarding step: it is counted and billed, not on the funnel.
    if (path === "recheck") return;
    // Admin console v2 §3: the biker funnel's "Didit started" step (one per paid session). Best-effort, as above.
    await domainEvents.riderStep(this.svc.prisma, profileId, "didit_started", { data: { path } });
  }

  /** Both bounds on a paid retry: the daily cap on fixable declines (KYC-R26-13), then the hourly paid-mint ceiling. */
  async assertMayMint(profileId: string): Promise<void> {
    await this.svc.assertUnderKycDailyLimit(profileId);
    await this.svc.assertUnderPaidMintLimit(profileId);
  }

  /**
   * Hand back a mint claim whose vendor call failed: the row returns to the status and kycRef it had, so a
   * declined rider is declined again (not a `pending` with no session) and the next tap claims afresh. CAS on
   * the claim marker, so a decision that landed meanwhile is never undone. Best-effort, never throws; a
   * release that fails leaves a stale claim, which expires after KYC_MINT_CLAIM_TTL_MS.
   */
  async releaseMintClaim(profileId: string, claim: string, previousStatus: Kyc, previousRef: string | null): Promise<void> {
    try {
      await this.svc.prisma.rider.updateMany({ where: { profileId, kycRef: claim }, data: { kycRef: previousRef, kycStatus: previousStatus } });
    } catch (err) {
      this.svc.logger.warn(`Couldn't release the KYC mint claim for ${profileId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async retryKyc(
    profileId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ kycStatus: Kyc; mode: Env["KYC_MODE"]; verificationUrl?: string; sessionToken?: string }> {
    const rider = await this.svc.prisma.rider.findUnique({
      where: { profileId },
      select: {
        kycStatus: true,
        kycAttempts: true,
        kycRef: true,
        kycSessionToken: true,
        kycSessionUrl: true,
        kycForcedAt: true,
        kycVendorStatus: true,
        // How recently become-rider created a row that has no session yet (see the in-progress check below).
        updatedAt: true,
      },
    });
    if (!rider) throw new NotFoundException("Not a biker");
    if (rider.kycStatus === "verified") throw new ConflictException({ reason: "already_verified", message: "Already verified" });
    // R-3: a check HELD for a human (the vendor's In Review, or an approval held in the review band or for
    // an ID collision) is not the rider's move; the app draws no retry on that wall. A retry that still
    // arrives (an older app) resumes the finished session for free when its credentials were kept (E2E
    // FS-11 keeps them on a hold) — but it must never MINT a fresh paid check for someone already in the
    // review queue. So a held check with no live session (a hold recorded before FS-11) is refused. Only
    // the stored webhook status counts — it is the vendor's signed word, and an admin reset clears it.
    const liveKycSession = Boolean(rider.kycRef && rider.kycSessionToken && rider.kycSessionUrl);
    if (
      this.svc.env.KYC_MODE === "auto" &&
      rider.kycStatus === "pending" &&
      !liveKycSession &&
      classifyStoredDiditStatus(rider.kycVendorStatus) === "held"
    ) {
      throw new ConflictException({ reason: "kyc_in_review", message: "Your ID is under review. We'll let you know when it's checked." });
    }
    // A-02 lock: one resubmit is allowed. After a second admin decline (kycAttempts >= 2) the
    // application is locked — no third attempt is minted; the rider must contact support. Enforced here
    // for every mode so a manual-mode rider can't loop past the limit either.
    if (rider.kycAttempts >= 2) {
      throw new ForbiddenException({ reason: "kyc_locked", message: "ID verification is locked after two attempts. Please contact support." });
    }
    // Manual mode has no vendor to resubmit to — the admin backstop resolves it.
    // BH-03: include `mode` even on this early return so the client can tell "no verificationUrl
    // because manual review is expected" apart from "no verificationUrl because something went wrong".
    if (this.svc.env.KYC_MODE !== "auto") {
      // E2E 2026-10-05 FS-2: answering `pending` is only true if the row says so. A declined (or expired)
      // rider who retried used to stay `failed`, outside the admin queue (`?kyc=pending`), told they were
      // waiting on a review nobody would run. Put them back in it — the same write as an admin `pending`
      // reset (session credentials cleared, kycResolvedAt kept so a stale webhook still can't land), and
      // the @updatedAt bump floats them to the top of the queue. Leaving `failed` is also what makes the
      // next admin decline count as a new attempt (adminSetKyc's F-14 guard). CAS on the observed state,
      // as the mint path below does, so a decision landing mid-request isn't clobbered.
      if (rider.kycStatus !== "pending") {
        const reopened = await this.svc.prisma.rider.updateMany({
          where: { profileId, kycStatus: rider.kycStatus, kycAttempts: rider.kycAttempts },
          data: { kycStatus: "pending", idVerified: false, kycSessionToken: null, kycSessionUrl: null },
        });
        if (reopened.count === 0) {
          throw new ConflictException("Your ID verification just changed — refresh and try again.");
        }
      }
      return { kycStatus: "pending", mode: this.svc.env.KYC_MODE };
    }

    // A paid session is already being bought for this rider, so this tap must not buy another:
    //  - another retry holds the mint claim (KYC_MINT_CLAIM_PREFIX) and hasn't rotated it in yet;
    //  - become-rider created the row moments ago and its vendor call hasn't attached the session yet
    //    (kycRef still null). Minting here bought a SECOND session for one sign-up, and the rotation then
    //    raced become's attach.
    // Both answer 409 `kyc_in_progress` (the app re-reads /auth/me, which hands back the session once it is
    // attached). Each is bounded by KYC_MINT_CLAIM_TTL_MS: a claim, or a session-less row, older than that is
    // a crashed request or a become whose release failed — minted for, so nobody is stuck behind it.
    const nowMs = Date.now();
    const claimAt = mintClaimAt(rider.kycRef);
    if (claimAt !== null && nowMs - claimAt < KYC_MINT_CLAIM_TTL_MS) throw kycInProgress();
    if (rider.kycRef === null && rider.kycStatus === "pending" && nowMs - rider.updatedAt.getTime() < KYC_MINT_CLAIM_TTL_MS) {
      throw kycInProgress();
    }

    // RESUME PATH — free. A `pending` rider still holding session credentials has an unfinished check,
    // not a dead one: hand them back and let the client re-open the SAME session. Costs zero credits
    // and keeps kycRef stable, so the webhook that eventually lands still resolves this rider.
    //
    // BOTH credentials go back, and that is not belt-and-braces — it is what keeps the SHIPPED app
    // working. Today's build opens `verificationUrl` in a browser tab (resolveKycRetryFeedback reads
    // ONLY that field); the native-SDK client that consumes `sessionToken` is still ahead of us. A
    // resume that returned the token alone would hand the live app a response it cannot use, and its
    // auto-mode fallback renders "Couldn't start verification — try again in a moment." — a false
    // error on a request that actually succeeded, which is precisely the BH-03 bug this codebase
    // already fixed once. Caught in review of this change; the test below pins it.
    //
    // Requiring the URL in the guard (not just the token) keeps that guarantee honest: a row that
    // somehow holds a token but no URL falls through and mints, which costs a credit but always
    // returns something every client can act on.
    //
    // Deliberately scoped to `pending`. A `failed` or `expired` rider needs a genuinely NEW check —
    // their session already reached a terminal decision and Didit will not reopen it — so those fall
    // through to the mint below. The device is the other half of this contract: when the SDK or the
    // browser rejects the credentials as expired, the client calls back here and, once a terminal
    // webhook has cleared the row, it mints (D7).
    //
    // `force` is the device's veto on all of the above. Expiry produces no webhook, so the row still
    // looks perfectly resumable from here; only the client that just watched the SDK reject the token
    // knows otherwise. Without this, "Try again" resumes the same dead session forever.
    //
    // But it is a CLIENT ASSERTION that bypasses the only thing stopping a pending rider from buying
    // paid sessions, so it is claimed, not trusted: one conditional UPDATE, before the vendor is ever
    // called. Winning the claim is what authorises the spend. A rider who already forced inside the
    // window loses it and silently falls back to the free resume — degraded, never refused, because a
    // 429 here would strand someone whose session really is dead. Two concurrent forced requests
    // cannot both win: the predicate and the write are one statement.
    const forceHonored =
      opts.force === true &&
      (await this.svc.claimForcedKycReplacement(profileId, {
        kycRef: rider.kycRef,
        kycStatus: rider.kycStatus,
        kycAttempts: rider.kycAttempts,
      }));
    let dailyLimitChecked = false;
    if (!forceHonored && rider.kycStatus === "pending" && rider.kycRef && rider.kycSessionToken && rider.kycSessionUrl) {
      // R-1 (startup review 2026-10-06): the resume guard proves a session EXISTS, never that it can
      // still be finished. The app's web lanes can't see expiry (the hosted page renders its own
      // "expired" screen), so the client never sends `force` — and "Finish verifying" re-opened a dead
      // session forever. The server CAN see it: the vendor's own status, from the signed webhook we
      // stored (Abandoned / Expired / Kyc Expired), or — when no webhook arrived — one cached vendor
      // read (shared with /auth/me's derivation, so it is one call per rider per TTL either way).
      const stored = classifyStoredDiditStatus(rider.kycVendorStatus);
      // A stored non-dead status still gets the (cached) read: an expiry whose webhook was lost must not
      // bring the loop back.
      const dead = stored === "dead" || (await this.svc.pendingStates?.read(rider.kycRef)) === "dead";
      if (!dead) {
        // The rider is about to re-open this session, so whatever we cached about it is about to move.
        this.svc.pendingStates?.invalidate(rider.kycRef);
        return {
          kycStatus: "pending",
          mode: this.svc.env.KYC_MODE,
          verificationUrl: rider.kycSessionUrl,
          sessionToken: rider.kycSessionToken,
        };
      }
      // A dead session is replaced, and the replacement is a PAID session — so it is claimed before the
      // vendor is called, like `force`'s claim: one conditional UPDATE retires exactly the credential we
      // read. Two concurrent taps cannot both win it (the loser sees the token already gone and gets the
      // same 409 the rotation raises), so a double tap on a dead session buys one session, not two. The
      // rotation's own CAS below still guards the write. Unlike `force` this is not a client assertion —
      // the vendor said the session is over — so it needs no window: a genuinely dead session always gets
      // its one replacement.
      // KYC-R26-13: the replacement is paid, so the daily cap applies — checked BEFORE the dead credential is
      // retired, so a refused rider is left exactly as they were (the cap lifts on its own within a day).
      await this.svc.assertMayMint(profileId);
      dailyLimitChecked = true;
      const retired = await this.svc.prisma.rider.updateMany({
        where: { profileId, kycStatus: "pending", kycRef: rider.kycRef, kycSessionToken: rider.kycSessionToken },
        data: { kycSessionToken: null, kycSessionUrl: null },
      });
      if (retired.count !== 1) {
        throw new ConflictException("Your ID verification just changed — refresh and try again.");
      }
      this.svc.logger.log(`KYC ${rider.kycRef}: the vendor reports the session dead — minting a replacement instead of resuming it (R-1)`);
    }

    // KYC-R26-13: every path that reaches here buys a fresh paid session (a declined / expired rider's new
    // check, a forced or dead-session replacement), so it is where the daily cap on fixable declines — and the
    // hourly ceiling on paid sessions — bites. A refused force hands its claim back, as a vendor failure does:
    // the claim bought nothing.
    const deadRetired = dailyLimitChecked;
    if (!dailyLimitChecked) {
      try {
        await this.svc.assertMayMint(profileId);
      } catch (err) {
        if (forceHonored) await this.svc.releaseForcedKycReplacement(profileId, rider.kycForcedAt);
        throw err;
      }
    }

    // CLAIM BEFORE PAYING, for the paths nothing above has claimed: a declined / expired rider's new check, and
    // a pending rider with no session (an admin reset, a become whose release failed). Their mint used to be
    // guarded only by the rotation CAS AFTER the vendor call, so a double tap after a decline bought two
    // sessions and threw one away. Now one conditional UPDATE swaps the observed kycRef for a mint-claim
    // marker (and reopens the check as `pending`, credentials cleared): exactly one tap wins it, and the other
    // gets 409 `kyc_in_progress` — before any money moves. A vendor failure puts the row back as it was.
    // (`force` and a dead session are claimed by their own CAS above.)
    let observed: { kycStatus: Kyc; kycRef: string | null } = { kycStatus: rider.kycStatus, kycRef: rider.kycRef };
    let mintClaim: string | null = null;
    if (!forceHonored && !deadRetired) {
      mintClaim = `${KYC_MINT_CLAIM_PREFIX}${nowMs}:${randomUUID()}`;
      const claimed = await this.svc.prisma.rider.updateMany({
        where: { profileId, kycStatus: rider.kycStatus, kycAttempts: rider.kycAttempts, kycRef: rider.kycRef },
        data: { kycRef: mintClaim, kycStatus: "pending", kycSessionToken: null, kycSessionUrl: null },
      });
      if (claimed.count !== 1) throw kycInProgress();
      observed = { kycStatus: "pending", kycRef: mintClaim };
    }

    let submission: Awaited<ReturnType<KycVendor["submit"]>>;
    try {
      submission = await this.svc.vendor.submit(profileId);
    } catch (err) {
      this.svc.logger.error(`KYC retry failed for ${profileId}: ${err instanceof Error ? err.message : String(err)}`);
      // The claim bought nothing — give it back, or the rider spends the rest of the window re-opening
      // the dead token that made them force in the first place.
      if (forceHonored) await this.svc.releaseForcedKycReplacement(profileId, rider.kycForcedAt);
      if (mintClaim) await this.svc.releaseMintClaim(profileId, mintClaim, rider.kycStatus, rider.kycRef);
      throw new ServiceUnavailableException("Couldn't restart ID verification. Please try again.");
    }
    await this.svc.recordKycSessionMinted(profileId, "retry");
    // The stub provider has no real callback, so it stands in as an instant pass (QA), mirroring become.
    const stubAutoPass = this.svc.env.KYC_PROVIDER === "stub";
    const next: Kyc = stubAutoPass ? "verified" : "pending";
    // CAS on the observed KYC state instead of a blind update-by-id (mirrors the admin CAS fixes in
    // admin-riders.service). The findUnique above takes no row lock, so between the read and this write
    // the vendor webhook (applyKycResult) or an admin decision (adminSetKyc) may have flipped kycStatus
    // and/or bumped kycAttempts — a blind update would clobber that newer state (re-open a locked
    // application, or reset a just-verified/declined rider back to pending on a stale ref). Guarding on
    // the exact (kycStatus, kycAttempts) we just read makes the two serialize: 0 rows ⇒ the row moved
    // under us ⇒ 409, and the rider re-reads rather than resubmitting onto a stale decision.
    // The kycRef we read (or the mint claim we just took) is part of it too: without it, a concurrent
    // become / retry that had already rotated a NEW session onto the row (same status, same attempts) was
    // silently overwritten by this one, orphaning a paid session the rider may already be inside.
    const rotated = await this.svc.prisma.rider.updateMany({
      where: { profileId, kycStatus: observed.kycStatus, kycAttempts: rider.kycAttempts, kycRef: observed.kycRef },
      // The new session's token replaces the old one wholesale. `?? null` rather than an optional
      // spread on purpose: a vendor response that carries no token must CLEAR the stale one, not leave
      // the previous session's credential attached to a kycRef it no longer belongs to.
      data: {
        kycStatus: next,
        idVerified: stubAutoPass,
        kycRef: submission.ref,
        kycResolvedAt: null,
        // KYC-R26-02: a fresh check — nobody has resolved it, so the vendor's result for it applies.
        kycResolvedBy: null,
        // `?? null` rather than an optional spread, for both: a vendor response missing a credential
        // must CLEAR the stale one, never leave the previous session's secret bound to a kycRef it no
        // longer belongs to. They are always written and cleared together.
        kycSessionToken: submission.token ?? null,
        kycSessionUrl: submission.url ?? null,
        // The stored vendor status described the session being replaced; the new one has reported nothing.
        kycVendorStatus: null,
        kycVendorStatusAt: null,
      },
    });
    if (rotated.count === 0) {
      throw new ConflictException("Your ID verification just changed — refresh and try again.");
    }
    this.svc.pendingStates?.invalidate(rider.kycRef);
    return { kycStatus: next, mode: this.svc.env.KYC_MODE, verificationUrl: submission.url, sessionToken: submission.token };
  }

  /**
   * The app finished a launch of the ID check (R-4): the rider says they completed it. Nothing is
   * trusted from that — no state changes — but whatever we cached about the session is now stale, so the
   * next `/auth/me` asks the vendor afresh instead of serving a pre-launch "unfinished" for up to a TTL.
   * One vendor read at most, coalesced with the poll; the route is throttled.
   */
  async noteKycLaunched(profileId: string): Promise<{ ok: true }> {
    const rider = await this.svc.prisma.rider.findUnique({ where: { profileId }, select: { kycRef: true, kycStatus: true } });
    if (rider?.kycStatus === "pending") this.svc.pendingStates?.invalidate(rider.kycRef);
    return { ok: true };
  }

  /**
   * Owner 2026-10-15: ops ask a VERIFIED biker for a new selfie check (`request`) — typically one verified with
   * `selfie_check = unverified` because their camera couldn't take a usable selfie — or mark the selfie checked
   * after looking at it themselves (`clear`). A request is a reminder only: the biker keeps going online and
   * taking jobs whatever they do with it; ops can still suspend through the usual route. The write and its audit
   * row commit together; a request pushes the reminder after the commit (best-effort, like every KYC push).
   */
  async adminSetSelfieCheck(
    profileId: string,
    action: "request" | "clear",
    actor = "admin",
    note?: string | null,
  ): Promise<{ profileId: string; selfieCheck: string | null }> {
    const selfieCheck = await this.svc.prisma.$transaction(async (tx) => {
      const rider = await tx.rider.findUnique({ where: { profileId }, select: { kycStatus: true } });
      if (!rider) throw new NotFoundException("Not a biker");
      if (rider.kycStatus !== "verified") {
        throw new ConflictException({ reason: "not_verified", message: "Only a verified biker's selfie can be re-checked. Decide their ID check first." });
      }
      // A request also lets go of any re-check session still open: one whose verdict never arrived (a lost webhook,
      // a review Didit later decided) would otherwise be handed back for ever, and the biker could never finish.
      const data =
        action === "request"
          ? { selfieCheck: SELFIE_CHECK_RECHECK_REQUESTED, selfieCheckAt: new Date(), selfieRecheckRef: null, selfieRecheckUrl: null }
          : { selfieCheck: null, selfieCheckReason: null, selfieCheckAt: null, selfieRecheckRef: null, selfieRecheckUrl: null };
      // CAS on the verified state read above, so a KYC decision landing mid-request isn't papered over.
      const res = await tx.rider.updateMany({ where: { profileId, kycStatus: "verified" }, data });
      if (res.count === 0) throw new ConflictException("This biker's ID check just changed — reload and try again.");
      await tx.auditLog.create({
        data: auditData(actor, action === "request" ? "rider.selfie_recheck_request" : "rider.selfie_check_clear", profileId, null, note ?? null),
      });
      return data.selfieCheck;
    });
    if (action === "request") void this.svc.notifyKycDecision(profileId, "selfie_recheck");
    return { profileId, selfieCheck };
  }

  /**
   * Owner 2026-10-15: the biker starts (or reopens) their selfie re-check. It is a fresh Didit session of the same
   * workflow (ID + selfie), held on the row apart from `kycRef` so its verdict can never touch the biker's
   * verification — the webhook routes it to applySelfieRecheck instead. A session already open is handed back for
   * free; a new one is paid, so it is bounded like every other mint (assertMayMint) and claimed before the vendor
   * call, so a double tap buys one session.
   */
  async startSelfieRecheck(profileId: string): Promise<{ verificationUrl: string }> {
    if (this.svc.env.KYC_MODE !== "auto") {
      throw new ConflictException({ reason: "selfie_recheck_unavailable", message: "The selfie check isn't available right now. Message us on WhatsApp." });
    }
    const rider = await this.svc.prisma.rider.findUnique({
      where: { profileId },
      select: { kycStatus: true, selfieCheck: true, selfieRecheckRef: true, selfieRecheckUrl: true },
    });
    if (!rider) throw new NotFoundException("Not a biker");
    // Only a re-check ops asked for (owner hold on #1216): a flag alone is ops' to look at, not a paid session to buy.
    if (rider.kycStatus !== "verified" || rider.selfieCheck !== SELFIE_CHECK_RECHECK_REQUESTED) {
      throw new ConflictException({ reason: "no_selfie_recheck", message: "There's no selfie check to redo." });
    }
    const claimAt = mintClaimAt(rider.selfieRecheckRef);
    if (rider.selfieRecheckRef && claimAt === null && rider.selfieRecheckUrl) return { verificationUrl: rider.selfieRecheckUrl };
    // Another tap is buying it right now (a fresh claim marker) — the same answer retryKyc gives.
    if (claimAt !== null && Date.now() - claimAt < KYC_MINT_CLAIM_TTL_MS) throw kycInProgress();
    await this.svc.assertUnderSelfieRecheckDailyLimit(profileId);
    await this.svc.assertMayMint(profileId);
    const claim = `${KYC_MINT_CLAIM_PREFIX}${Date.now()}:${randomUUID()}`;
    const claimed = await this.svc.prisma.rider.updateMany({
      where: { profileId, kycStatus: "verified", selfieCheck: SELFIE_CHECK_RECHECK_REQUESTED, selfieRecheckRef: rider.selfieRecheckRef },
      data: { selfieRecheckRef: claim, selfieRecheckUrl: null },
    });
    if (claimed.count !== 1) throw kycInProgress();
    const release = () =>
      this.svc.prisma.rider.updateMany({ where: { profileId, selfieRecheckRef: claim }, data: { selfieRecheckRef: null } }).catch(() => undefined);
    let submission: Awaited<ReturnType<KycVendor["submit"]>>;
    try {
      submission = await this.svc.vendor.submit(profileId);
    } catch (err) {
      this.svc.logger.error(`Selfie re-check start failed for ${profileId}: ${err instanceof Error ? err.message : String(err)}`);
      await release();
      throw new ServiceUnavailableException("Couldn't start the selfie check. Please try again.");
    }
    await this.svc.recordKycSessionMinted(profileId, "recheck");
    if (!submission.url) {
      await release();
      throw new ServiceUnavailableException("Couldn't start the selfie check. Please try again.");
    }
    await this.svc.prisma.rider.updateMany({
      where: { profileId, selfieRecheckRef: claim },
      data: { selfieRecheckRef: submission.ref, selfieRecheckUrl: submission.url },
    });
    return { verificationUrl: submission.url };
  }

  /** SELFIE_RECHECK_DAILY_LIMIT: refuse a fresh paid re-check, with the same 429 shape as the other KYC caps. */
  async assertUnderSelfieRecheckDailyLimit(profileId: string): Promise<void> {
    const minted = await this.svc.prisma.auditLog.count({
      where: {
        action: "rider.kyc_session_minted",
        target: profileId,
        reasonCode: "recheck",
        createdAt: { gte: new Date(Date.now() - KYC_DAILY_LIMIT_WINDOW_MS) },
      },
    });
    if (minted >= SELFIE_RECHECK_DAILY_LIMIT) {
      this.svc.logger.warn(`Selfie re-check for ${profileId} refused: ${minted} paid re-checks in the last 24h`);
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS, reason: "kyc_daily_limit", message: "You've tried the selfie check a few times today. Please try again tomorrow." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * The webhook's `id_unreadable` declines of this biker since the last clean slate: their latest verify, a
   * person's decision (an admin approve, decline, expire or reset) or an earlier unreadable hold. What the
   * unreadable hold counts (owner 2026-10-15, option 2), so old history never costs a biker today's retakes.
   */
  async unreadableDeclinesSinceCleanSlate(tx: Prisma.TransactionClient, profileId: string): Promise<number> {
    const slate = await tx.auditLog.findFirst({
      where: {
        target: profileId,
        OR: [
          { action: { in: ["rider.kyc_approve", "rider.kyc_expire", "rider.kyc_reset", "rider.kyc_review_required"] } },
          { action: "rider.kyc_decline", NOT: { actor: KYC_WEBHOOK_ACTOR } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return tx.auditLog.count({
      where: {
        actor: KYC_WEBHOOK_ACTOR,
        action: "rider.kyc_decline",
        target: profileId,
        reasonCode: KycDeclineReason.ID_UNREADABLE,
        ...(slate ? { createdAt: { gt: slate.createdAt } } : {}),
      },
    });
  }

  /** The biker whose selfie re-check this vendor session is, or null (owner 2026-10-15). */
  async selfieRecheckOwner(ref: string): Promise<string | null> {
    if (!ref || ref.startsWith(KYC_MINT_CLAIM_PREFIX)) return null;
    const rider = await this.svc.prisma.rider.findFirst({ where: { selfieRecheckRef: ref }, select: { profileId: true } });
    return rider?.profileId ?? null;
  }

  /**
   * Owner 2026-10-15: the verdict on a selfie re-check. It never changes the biker's verification — a re-check is
   * a reminder ops sent, not a gate:
   *  - passed: the flag clears (the selfie is now checked), audited `rider.selfie_recheck_pass`;
   *  - failed: the flag stays, with the reason ops see, audited `rider.selfie_recheck_fail`; the biker may try
   *    again (the next tap buys a new session) and keeps riding;
   *  - dead (abandoned / expired session): only the session is let go, so the next tap mints rather than reopening
   *    a page that can't be finished.
   * A pass also has to be THIS biker's ID: when the account has a national ID (typed or adopted from their check),
   * the re-check's document number must be it — otherwise a borrowed card and its owner's face would "pass".
   * Applied once: the session is cleared with its verdict, so a retried delivery finds no rider.
   */
  async applySelfieRecheck(
    ref: string,
    verdict: { kind: "passed" } | { kind: "failed"; reason: string } | { kind: "dead" },
    verifiedDocNumber?: string | null,
  ): Promise<{ updated: number; passed?: boolean }> {
    return this.svc.prisma.$transaction(async (tx) => {
      const rider = await tx.rider.findFirst({
        where: { selfieRecheckRef: ref },
        select: { profileId: true, verifiedIdHash: true, profile: { select: { idNumberHash: true } } },
      });
      if (!rider) return { updated: 0 };
      if (verdict.kind === "dead") {
        const res = await tx.rider.updateMany({ where: { selfieRecheckRef: ref }, data: { selfieRecheckRef: null, selfieRecheckUrl: null } });
        return { updated: res.count };
      }
      let outcome = verdict;
      if (outcome.kind === "passed") {
        const known = [rider.profile?.idNumberHash, rider.verifiedIdHash].filter((h): h is string => !!h);
        if (known.length > 0) {
          if (!verifiedDocNumber) outcome = { kind: "failed", reason: KycDeclineReason.ID_UNREADABLE };
          else if (!known.includes(this.svc.pii.hashId(verifiedDocNumber))) outcome = { kind: "failed", reason: KycDeclineReason.ID_MISMATCH };
        }
      }
      const passed = outcome.kind === "passed";
      const res = await tx.rider.updateMany({
        where: { selfieRecheckRef: ref },
        data: passed
          ? { selfieCheck: null, selfieCheckReason: null, selfieCheckAt: null, selfieRecheckRef: null, selfieRecheckUrl: null }
          : { selfieCheckReason: outcome.kind === "failed" ? outcome.reason : null, selfieRecheckRef: null, selfieRecheckUrl: null },
      });
      if (res.count > 0) {
        await tx.auditLog.create({
          data: auditData(
            KYC_WEBHOOK_ACTOR,
            passed ? "rider.selfie_recheck_pass" : "rider.selfie_recheck_fail",
            rider.profileId,
            outcome.kind === "failed" ? outcome.reason : null,
            null,
          ),
        });
        this.svc.logger.log(`Selfie re-check ${ref} for biker ${rider.profileId}: ${passed ? "passed — flag cleared" : `didn't pass (${outcome.kind === "failed" ? outcome.reason : ""})`}`);
      }
      return { updated: res.count, passed };
    });
  }

  /**
   * R-1 / R-3: record the vendor's status for a session that is still undecided on our side — every
   * signed status webhook that doesn't resolve the check (In Progress, In Review, Abandoned, Expired, a
   * review-band approval…). Monotonic on the webhook's event time, so a late delivery of an older status
   * can't overwrite a newer one. Only the rider's CURRENT session (kycRef) while `pending` matches: a
   * replaced session's late webhook, and a decided rider, match no row.
   *
   * A DEAD session (Abandoned / Expired / Kyc Expired) also loses its stored credentials in the same
   * write: they can never open a finishable check again, so the next retry mints instead of resuming,
   * and /auth/me stops deriving a pending state from a session nobody can finish.
   */
  async recordKycVendorStatus(kycRef: string, vendorStatus: string, eventAt: Date): Promise<{ updated: number }> {
    const dead = classifyStoredDiditStatus(vendorStatus) === "dead";
    const res = await this.svc.prisma.rider.updateMany({
      where: {
        kycRef,
        kycStatus: "pending",
        OR: [{ kycVendorStatusAt: null }, { kycVendorStatusAt: { lt: eventAt } }],
      },
      data: {
        kycVendorStatus: vendorStatus.slice(0, 64),
        kycVendorStatusAt: eventAt,
        ...(dead ? { kycSessionToken: null, kycSessionUrl: null } : {}),
      },
    });
    // The vendor just told us; serve that rather than asking it again on the next poll.
    if (res.count > 0) this.svc.pendingStates?.prime(kycRef, vendorStatus);
    return { updated: res.count };
  }

  /**
   * KYC-R26-07: the profile that owns a KYC session (riders.kyc_ref is unique), or null when no rider holds it
   * (unknown, replaced by a retry, or erased). The webhook compares it with the delivery's signed
   * `vendor_data` — the profileId we sent Didit at session-create — before applying anything.
   */
  async kycSessionOwner(kycRef: string): Promise<string | null> {
    const row = await this.svc.prisma.rider.findFirst({ where: { kycRef }, select: { profileId: true } });
    return row?.profileId ?? null;
  }

  /**
   * KYC-R26-03: the pending checks whose terminal webhook may have been lost — riders still `pending` on a
   * vendor session (kycRef) nobody has resolved (kycResolvedAt null), last touched before `olderThan` (the
   * row's @updatedAt: any write — the session's own creation included — bumps it, so it lower-bounds the
   * session's age), excluding sessions the vendor already told us are dead (they can never be decided; the
   * next retry mints) and a mint claim (retryKyc's in-progress marker, not a vendor session).
   *
   * OLDEST-WAITING FIRST (updatedAt asc): a bounded batch serves the riders who have waited longest, not
   * whoever sorts first by id. `excludeRefs` are the sessions the reconciler is backing off from (a read that
   * decided nothing), so they don't hold the head of the queue and the batch reaches the rest of the backlog.
   *
   * The dead-status test is normalised exactly as didit.ts classifies one (case, and `_`/`-`/space runs —
   * Didit has spelled these several ways), in SQL, so `KYC_EXPIRED` or `kyc expired` is excluded like
   * `Kyc Expired` instead of being re-read every tick forever. Raw SQL for that reason only.
   */
  async kycReconcileCandidates(
    olderThan: Date,
    limit: number,
    excludeRefs: readonly string[] = [],
  ): Promise<Array<{ profileId: string; kycRef: string; kycVendorStatus: string | null }>> {
    const rows = await this.svc.prisma.$queryRaw<Array<{ profileId: string; kycRef: string | null; kycVendorStatus: string | null }>>`
      SELECT profile_id::text AS "profileId", kyc_ref AS "kycRef", kyc_vendor_status AS "kycVendorStatus"
      FROM riders
      WHERE kyc_status = 'pending'
        AND kyc_ref IS NOT NULL
        AND kyc_ref NOT LIKE ${`${KYC_MINT_CLAIM_PREFIX}%`}
        AND kyc_resolved_at IS NULL
        AND updated_at < ${olderThan}
        AND (
          kyc_vendor_status IS NULL
          OR regexp_replace(lower(btrim(kyc_vendor_status)), '[[:space:]_-]+', ' ', 'g') <> ALL (${[...DIDIT_DEAD_STATUSES_NORMALISED]}::text[])
        )
        AND kyc_ref <> ALL (${[...excludeRefs]}::text[])
      ORDER BY updated_at ASC
      LIMIT ${limit}`;
    return rows.filter((r): r is { profileId: string; kycRef: string; kycVendorStatus: string | null } => !!r.kycRef);
  }

  /** When the longest-waiting pending check on a vendor session was last touched (its @updatedAt), or null when
   *  none is waiting — the reconciler's `kyc_oldest_pending_age_seconds` gauge. Mint claims are not sessions. */
  async kycOldestPendingSince(): Promise<Date | null> {
    const row = await this.svc.prisma.rider.findFirst({
      where: { kycStatus: "pending", kycRef: { not: null }, kycResolvedAt: null, NOT: { kycRef: { startsWith: KYC_MINT_CLAIM_PREFIX } } },
      select: { updatedAt: true },
      orderBy: { updatedAt: "asc" },
    });
    return row?.updatedAt ?? null;
  }

  /**
   * KYC-R26-08: move VERIFIED riders whose ID document has expired (kycIdExpiresOn before today, UTC) to
   * `expired` — the same state, and the same write, as a vendor "Kyc Expired" or an ops expire: idVerified
   * off, the A-02 counter reset unless already locked (DS17-03), forced offline in the same write and evicted
   * from the live-supply planes post-commit (Class-B), the lapse day kept (kycIdExpiryOnLapse). Before this,
   * a verified rider kept riding on an expired card unless Didit happened to send "Kyc Expired".
   *
   * Each rider is its own transaction: row lock, re-read, CAS on still-verified + still-lapsed, so an admin
   * decision or a re-verification landing meanwhile wins. Audited as `rider.kyc_expire` by
   * `system:kyc-id-expiry` with reason `id_expired` (the account-status feed reads it like an ops expire).
   * Pushes F6's "Your ID has expired" (KYC_PUSH_COPY.expired; the app's F6 screen names the day), like every
   * expiry now. Bounded by `limit`; never throws per rider.
   */
  async expireLapsedIds(now: Date = new Date(), limit = 200): Promise<{ expired: number }> {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const lapsed = await this.svc.prisma.rider.findMany({
      where: { kycStatus: "verified", kycIdExpiresOn: { lt: today } },
      select: { profileId: true },
      orderBy: { kycIdExpiresOn: "asc" },
      take: limit,
    });
    let expired = 0;
    for (const { profileId } of lapsed) {
      try {
        const done = await this.svc.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT 1 FROM riders WHERE profile_id = ${profileId}::uuid FOR UPDATE`;
          const cur = await tx.rider.findUnique({ where: { profileId }, select: { kycStatus: true, kycAttempts: true, kycIdExpiresOn: true } });
          if (!cur || cur.kycStatus !== "verified" || !cur.kycIdExpiresOn || cur.kycIdExpiresOn >= today) return false;
          const res = await tx.rider.updateMany({
            where: { profileId, kycStatus: "verified" },
            data: {
              kycStatus: "expired",
              idVerified: false,
              kycDeclineReason: null,
              kycResolvedAt: now,
              kycResolvedBy: KYC_RESOLVED_BY_SYSTEM,
              kycSessionToken: null,
              kycSessionUrl: null,
              kycVendorStatus: null,
              kycVendorStatusAt: null,
              ...(cur.kycAttempts < 2 ? { kycAttempts: 0 } : {}),
              isOnline: false,
              kycIdExpiresOn: kycIdExpiryOnLapse(cur.kycIdExpiresOn, now),
            },
          });
          if (res.count === 0) return false;
          await tx.auditLog.create({ data: auditData(KYC_ID_EXPIRY_ACTOR, "rider.kyc_expire", profileId, KycDeclineReason.ID_EXPIRED, null) });
          await domainEvents.record(tx, {
            type: "kyc.attempt",
            actorRole: "system",
            subjectType: "rider",
            subjectId: profileId,
            data: { decision: "expired", reason: KycDeclineReason.ID_EXPIRED, resolvedBy: KYC_RESOLVED_BY_SYSTEM },
          });
          await domainEvents.riderOffline(tx, profileId, "id_expired");
          return true;
        });
        if (done) {
          expired++;
          void this.svc.gateway.evictRiderFromSupply(profileId);
          // F6's push: the rider learns away from the app that they are off the road until they re-verify.
          void this.svc.notifyKycDecision(profileId, "expired");
        }
      } catch (err) {
        this.svc.logger.error(`ID-expiry sweep failed for biker ${profileId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (expired > 0) this.svc.logger.log(`ID-expiry sweep: ${expired} verified biker(s) moved to expired — their ID document lapsed (KYC-R26-08)`);
    return { expired };
  }
}
