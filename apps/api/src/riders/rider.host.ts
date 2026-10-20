/**
 * What RiderService's parts reach on the service (R-6, QA 2026-10-20). The parts are typed against this
 * interface instead of the service class so they don't import it back (no import cycle); the service passes
 * itself, and TypeScript checks it satisfies this.
 */
import type { Logger } from "@nestjs/common";
import type { UploadVerifier } from "../adapters/storage/upload-verifier";
import type { Env } from "../config/env";
import type { KycVendor } from "../kyc/kyc-vendor";
import type { KycPendingStateService } from "../kyc/kyc-pending-state.service";
import type { KycMintPath, MetricsService } from "../observability/metrics.service";
import type { PiiCryptoService } from "../common/pii-crypto.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { TrackingService } from "../tracking/tracking.service";
import type { OwnerAlertsService } from "../owner-alerts/owner-alerts.service";
import type { Prisma, Role } from "@prisma/client";
import type { Kyc } from "./rider.helpers";
import type { KycPushVariant } from "../kyc/kyc-push-copy";

export interface RiderHost {
  adoptVerifiedId(tx: Prisma.TransactionClient, profileId: string, verifiedNumber: string, replacing?: string | null): Promise<"adopted" | "same" | "different">;
  assertMayMint(profileId: string): Promise<void>;
  assertUnderKycDailyLimit(profileId: string): Promise<void>;
  assertUnderPaidMintLimit(profileId: string): Promise<void>;
  assertUnderSelfieRecheckDailyLimit(profileId: string): Promise<void>;
  claimForcedKycReplacement(profileId: string, observed: { kycRef: string | null; kycStatus: Kyc; kycAttempts: number }): Promise<boolean>;
  drainNotifyWaiters(lat: number, lng: number): Promise<void>;
  duplicateIdAccountCount(profileId: string, idNumberHash: string | null | undefined): Promise<number>;
  readonly env: Env;
  readonly gateway: TrackingGateway;
  liveDuplicateIdAccountCount(db: Prisma.TransactionClient, profileId: string, idNumberHash: string): Promise<number>;
  liveSessionReplay(profileId: string): Promise<{ kycStatus: Kyc; mode: Env["KYC_MODE"]; verificationUrl?: string; sessionToken?: string } | null>;
  lockIdForApproval(tx: Prisma.TransactionClient, profileId: string): Promise<string | null>;
  lockNationalId(tx: Prisma.TransactionClient, idNumberHash: string): Promise<void>;
  readonly logger: Logger;
  readonly metrics?: MetricsService;
  noteOnlineWithoutPushToken(profileId: string): Promise<void>;
  readonly notifications: NotificationsService;
  notifyFleetInviteWaiting(profileId: string): Promise<void>;
  notifyKycDecision(profileId: string, variant: KycPushVariant): Promise<boolean>;
  readonly ownerAlerts?: OwnerAlertsService;
  readonly pendingStates?: KycPendingStateService;
  readonly pii: PiiCryptoService;
  readonly prisma: PrismaService;
  recordKycSessionMinted(profileId: string, path: KycMintPath): Promise<void>;
  releaseForcedKycReplacement(profileId: string, previous: Date | null): Promise<void>;
  releaseMintClaim(profileId: string, claim: string, previousStatus: Kyc, previousRef: string | null): Promise<void>;
  releaseRiderClaim(profileId: string, previousRole: Role | null | undefined): Promise<void>;
  settleNationalIdOnApproval(tx: Prisma.TransactionClient, rider: {
      profileId: string;
      verifiedIdHash: string | null;
      verifiedIdNumber: string | null;
      profile: { idNumberHash: string | null } | null;
    }, lockedIdHash: string | null, adoption: { attempted: boolean }): Promise<{ outcome: "on_file" | "missing" } | { outcome: "adopted"; duplicateIdFlag: boolean }>;
  readonly tracking: TrackingService;
  unreadableDeclinesSinceCleanSlate(tx: Prisma.TransactionClient, profileId: string): Promise<number>;
  readonly uploads?: UploadVerifier;
  readonly vendor: KycVendor;
  verifiedIdCollisionCount(db: Prisma.TransactionClient, profileId: string, hash: string, scope: "any" | "live"): Promise<number>;
}
