import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { UploadVerifier } from "../adapters/storage/upload-verifier";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { KYC_VENDOR, type KycVendor } from "../kyc/kyc-vendor";
import { KycPendingStateService } from "../kyc/kyc-pending-state.service";
import { MetricsService } from "../observability/metrics.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { TrackingService } from "../tracking/tracking.service";
import { OwnerAlertsService } from "../owner-alerts/owner-alerts.service";
import { canGoOnline, onlineRefusalReason, type OnlineRefusal } from "./online-gate";
import { RiderOnboarding } from "./rider.onboarding";
import { RiderKycSessions } from "./rider.kyc-sessions";
import { RiderKycDecisions } from "./rider.kyc-decisions";
import { RiderAvailability } from "./rider.availability";


// Re-export the online-gate helpers so existing importers (matching/offers/tests) keep their
// `from "./rider.service"` path. The definitions live in ./online-gate — importing them from here
// would re-form the rider↔tracking cycle those services' imports are designed to avoid.
export { canGoOnline, onlineRefusalReason, type OnlineRefusal };

export { KYC_RESOLVED_BY_ADMIN, KYC_RESOLVED_BY_VENDOR, KYC_RESOLVED_BY_SYSTEM, KYC_UNREADABLE_DECLINES_BEFORE_REVIEW, SELFIE_CHECK_UNVERIFIED, SELFIE_CHECK_RECHECK_REQUESTED, SELFIE_RECHECK_DAILY_LIMIT, KYC_DAILY_FIXABLE_DECLINE_LIMIT, KYC_PAID_MINT_LIMIT } from "./rider.helpers";

@Injectable()
export class RiderService {
  readonly logger = new Logger(RiderService.name);
  // R-6 (QA 2026-10-20): the methods live in four parts — onboarding (profile, become a biker, national-ID
  // checks), KYC sessions (minting, retries, limits, selfie re-checks, vendor status, expiry), KYC decisions
  // (applying a result, admin overrides, ID settlement) and availability (online, heartbeat). This class keeps
  // the state and delegates, so every caller and spec is unchanged.
  private readonly onboarding = new RiderOnboarding(this);
  private readonly kycSessions = new RiderKycSessions(this);
  private readonly kycDecisions = new RiderKycDecisions(this);
  private readonly availability = new RiderAvailability(this);

  constructor(
    readonly prisma: PrismaService,
    @Inject(ENV) readonly env: Env,
    @Inject(KYC_VENDOR) readonly vendor: KycVendor,
    readonly pii: PiiCryptoService,
    readonly tracking: TrackingService,
    // Standing-demotion funnel (Class-B): the board-kick half of evictRiderFromSupply is socket-layer, so
    // it lives on the gateway, not TrackingService. TrackingModule exports the gateway and doesn't depend
    // on RidersModule, so this stays acyclic (same wiring admin-riders.service uses).
    readonly gateway: TrackingGateway,
    readonly notifications: NotificationsService,
    // C1/E8 attach-time upload check. StorageModule is @Global, so Nest always injects it (no @Optional:
    // a missing provider fails boot rather than silently skipping the check); TS-optional only so the
    // existing positional spec constructions stay valid.
    readonly uploads?: UploadVerifier,
    // The shared pending-state cache (KycModule, imported by RidersModule — so Nest always injects it).
    // retryKyc asks it whether a stored session is dead (R-1), and every write that moves a session's
    // state invalidates or primes it (R-4). TS-optional for the positional spec constructions, same as
    // `uploads`; without it retryKyc simply trusts the persisted vendor status.
    readonly pendingStates?: KycPendingStateService,
    // KYC observability (paid mints, undelivered KYC pushes, token-less bikers going online). The @Global
    // ObservabilityModule always injects it; TS-optional for the positional spec constructions.
    readonly metrics?: MetricsService,
    // The owner's new-biker alert. @Global (OwnerAlertsModule); @Optional for the positional spec constructions.
    @Optional() readonly ownerAlerts?: OwnerAlertsService,
  ) {}

  duplicateIdAccountCount(...args: Parameters<RiderOnboarding["duplicateIdAccountCount"]>): ReturnType<RiderOnboarding["duplicateIdAccountCount"]> {
    return this.onboarding.duplicateIdAccountCount(...args);
  }

  liveDuplicateIdAccountCount(...args: Parameters<RiderOnboarding["liveDuplicateIdAccountCount"]>): ReturnType<RiderOnboarding["liveDuplicateIdAccountCount"]> {
    return this.onboarding.liveDuplicateIdAccountCount(...args);
  }

  lockNationalId(...args: Parameters<RiderOnboarding["lockNationalId"]>): ReturnType<RiderOnboarding["lockNationalId"]> {
    return this.onboarding.lockNationalId(...args);
  }

  verifiedIdCollisionCount(...args: Parameters<RiderOnboarding["verifiedIdCollisionCount"]>): ReturnType<RiderOnboarding["verifiedIdCollisionCount"]> {
    return this.onboarding.verifiedIdCollisionCount(...args);
  }

  adoptVerifiedId(...args: Parameters<RiderOnboarding["adoptVerifiedId"]>): ReturnType<RiderOnboarding["adoptVerifiedId"]> {
    return this.onboarding.adoptVerifiedId(...args);
  }

  completeProfile(...args: Parameters<RiderOnboarding["completeProfile"]>): ReturnType<RiderOnboarding["completeProfile"]> {
    return this.onboarding.completeProfile(...args);
  }

  becomeRider(...args: Parameters<RiderOnboarding["becomeRider"]>): ReturnType<RiderOnboarding["becomeRider"]> {
    return this.onboarding.becomeRider(...args);
  }

  liveSessionReplay(...args: Parameters<RiderOnboarding["liveSessionReplay"]>): ReturnType<RiderOnboarding["liveSessionReplay"]> {
    return this.onboarding.liveSessionReplay(...args);
  }

  releaseRiderClaim(...args: Parameters<RiderOnboarding["releaseRiderClaim"]>): ReturnType<RiderOnboarding["releaseRiderClaim"]> {
    return this.onboarding.releaseRiderClaim(...args);
  }

  claimForcedKycReplacement(...args: Parameters<RiderKycSessions["claimForcedKycReplacement"]>): ReturnType<RiderKycSessions["claimForcedKycReplacement"]> {
    return this.kycSessions.claimForcedKycReplacement(...args);
  }

  releaseForcedKycReplacement(...args: Parameters<RiderKycSessions["releaseForcedKycReplacement"]>): ReturnType<RiderKycSessions["releaseForcedKycReplacement"]> {
    return this.kycSessions.releaseForcedKycReplacement(...args);
  }

  assertUnderKycDailyLimit(...args: Parameters<RiderKycSessions["assertUnderKycDailyLimit"]>): ReturnType<RiderKycSessions["assertUnderKycDailyLimit"]> {
    return this.kycSessions.assertUnderKycDailyLimit(...args);
  }

  assertUnderPaidMintLimit(...args: Parameters<RiderKycSessions["assertUnderPaidMintLimit"]>): ReturnType<RiderKycSessions["assertUnderPaidMintLimit"]> {
    return this.kycSessions.assertUnderPaidMintLimit(...args);
  }

  recordKycSessionMinted(...args: Parameters<RiderKycSessions["recordKycSessionMinted"]>): ReturnType<RiderKycSessions["recordKycSessionMinted"]> {
    return this.kycSessions.recordKycSessionMinted(...args);
  }

  assertMayMint(...args: Parameters<RiderKycSessions["assertMayMint"]>): ReturnType<RiderKycSessions["assertMayMint"]> {
    return this.kycSessions.assertMayMint(...args);
  }

  releaseMintClaim(...args: Parameters<RiderKycSessions["releaseMintClaim"]>): ReturnType<RiderKycSessions["releaseMintClaim"]> {
    return this.kycSessions.releaseMintClaim(...args);
  }

  retryKyc(...args: Parameters<RiderKycSessions["retryKyc"]>): ReturnType<RiderKycSessions["retryKyc"]> {
    return this.kycSessions.retryKyc(...args);
  }

  noteKycLaunched(...args: Parameters<RiderKycSessions["noteKycLaunched"]>): ReturnType<RiderKycSessions["noteKycLaunched"]> {
    return this.kycSessions.noteKycLaunched(...args);
  }

  adminSetSelfieCheck(...args: Parameters<RiderKycSessions["adminSetSelfieCheck"]>): ReturnType<RiderKycSessions["adminSetSelfieCheck"]> {
    return this.kycSessions.adminSetSelfieCheck(...args);
  }

  startSelfieRecheck(...args: Parameters<RiderKycSessions["startSelfieRecheck"]>): ReturnType<RiderKycSessions["startSelfieRecheck"]> {
    return this.kycSessions.startSelfieRecheck(...args);
  }

  assertUnderSelfieRecheckDailyLimit(...args: Parameters<RiderKycSessions["assertUnderSelfieRecheckDailyLimit"]>): ReturnType<RiderKycSessions["assertUnderSelfieRecheckDailyLimit"]> {
    return this.kycSessions.assertUnderSelfieRecheckDailyLimit(...args);
  }

  unreadableDeclinesSinceCleanSlate(...args: Parameters<RiderKycSessions["unreadableDeclinesSinceCleanSlate"]>): ReturnType<RiderKycSessions["unreadableDeclinesSinceCleanSlate"]> {
    return this.kycSessions.unreadableDeclinesSinceCleanSlate(...args);
  }

  selfieRecheckOwner(...args: Parameters<RiderKycSessions["selfieRecheckOwner"]>): ReturnType<RiderKycSessions["selfieRecheckOwner"]> {
    return this.kycSessions.selfieRecheckOwner(...args);
  }

  applySelfieRecheck(...args: Parameters<RiderKycSessions["applySelfieRecheck"]>): ReturnType<RiderKycSessions["applySelfieRecheck"]> {
    return this.kycSessions.applySelfieRecheck(...args);
  }

  recordKycVendorStatus(...args: Parameters<RiderKycSessions["recordKycVendorStatus"]>): ReturnType<RiderKycSessions["recordKycVendorStatus"]> {
    return this.kycSessions.recordKycVendorStatus(...args);
  }

  kycSessionOwner(...args: Parameters<RiderKycSessions["kycSessionOwner"]>): ReturnType<RiderKycSessions["kycSessionOwner"]> {
    return this.kycSessions.kycSessionOwner(...args);
  }

  kycReconcileCandidates(...args: Parameters<RiderKycSessions["kycReconcileCandidates"]>): ReturnType<RiderKycSessions["kycReconcileCandidates"]> {
    return this.kycSessions.kycReconcileCandidates(...args);
  }

  kycOldestPendingSince(...args: Parameters<RiderKycSessions["kycOldestPendingSince"]>): ReturnType<RiderKycSessions["kycOldestPendingSince"]> {
    return this.kycSessions.kycOldestPendingSince(...args);
  }

  expireLapsedIds(...args: Parameters<RiderKycSessions["expireLapsedIds"]>): ReturnType<RiderKycSessions["expireLapsedIds"]> {
    return this.kycSessions.expireLapsedIds(...args);
  }

  setOnline(...args: Parameters<RiderAvailability["setOnline"]>): ReturnType<RiderAvailability["setOnline"]> {
    return this.availability.setOnline(...args);
  }

  heartbeat(...args: Parameters<RiderAvailability["heartbeat"]>): ReturnType<RiderAvailability["heartbeat"]> {
    return this.availability.heartbeat(...args);
  }

  drainNotifyWaiters(...args: Parameters<RiderAvailability["drainNotifyWaiters"]>): ReturnType<RiderAvailability["drainNotifyWaiters"]> {
    return this.availability.drainNotifyWaiters(...args);
  }

  applyKycResult(...args: Parameters<RiderKycDecisions["applyKycResult"]>): ReturnType<RiderKycDecisions["applyKycResult"]> {
    return this.kycDecisions.applyKycResult(...args);
  }

  recordHeldVerifiedId(...args: Parameters<RiderKycDecisions["recordHeldVerifiedId"]>): ReturnType<RiderKycDecisions["recordHeldVerifiedId"]> {
    return this.kycDecisions.recordHeldVerifiedId(...args);
  }

  notifyKycDecision(...args: Parameters<RiderKycDecisions["notifyKycDecision"]>): ReturnType<RiderKycDecisions["notifyKycDecision"]> {
    return this.kycDecisions.notifyKycDecision(...args);
  }

  notifyFleetInviteWaiting(...args: Parameters<RiderKycDecisions["notifyFleetInviteWaiting"]>): ReturnType<RiderKycDecisions["notifyFleetInviteWaiting"]> {
    return this.kycDecisions.notifyFleetInviteWaiting(...args);
  }

  noteOnlineWithoutPushToken(...args: Parameters<RiderAvailability["noteOnlineWithoutPushToken"]>): ReturnType<RiderAvailability["noteOnlineWithoutPushToken"]> {
    return this.availability.noteOnlineWithoutPushToken(...args);
  }

  lockIdForApproval(...args: Parameters<RiderKycDecisions["lockIdForApproval"]>): ReturnType<RiderKycDecisions["lockIdForApproval"]> {
    return this.kycDecisions.lockIdForApproval(...args);
  }

  settleNationalIdOnApproval(...args: Parameters<RiderKycDecisions["settleNationalIdOnApproval"]>): ReturnType<RiderKycDecisions["settleNationalIdOnApproval"]> {
    return this.kycDecisions.settleNationalIdOnApproval(...args);
  }

  adminSetKyc(...args: Parameters<RiderKycDecisions["adminSetKyc"]>): ReturnType<RiderKycDecisions["adminSetKyc"]> {
    return this.kycDecisions.adminSetKyc(...args);
  }
}
