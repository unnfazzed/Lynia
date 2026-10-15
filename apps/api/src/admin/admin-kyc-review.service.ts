import { Inject, Injectable } from "@nestjs/common";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { maskPhone } from "../common/phone-mask";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { classifyStoredDiditStatus } from "../kyc/didit";
import { PrismaService } from "../prisma/prisma.service";

// Long enough that a reviewer working through the queue doesn't have the image expire mid-review;
// short enough that a leaked/cached admin response can't be used to fetch the photo indefinitely.
const KYC_PHOTO_READ_URL_TTL_SECONDS = 15 * 60;

@Injectable()
export class AdminKycReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pii: PiiCryptoService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  /**
   * Single-rider KYC review detail (admin A-02) — the doc-review screen behind the KYC queue. Returns
   * the real, persisted KYC state: status, the resubmission counter + derived lock/attempt, the last
   * decline reason, and the applicant fields ops compare against the documents. Phone is masked (A-03)
   * — the reviewer matches the ID number, not the phone.
   *
   * Didit's granular scores (face-match, doc authenticity, liveness) are NOT persisted in the pilot —
   * only the overall verdict flows through the webhook into `kycStatus`. Those fields are therefore
   * omitted here; the console renders the checks panel from `kycStatus` + the reviewer's own compare.
   */
  async getKycReview(profileId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId },
      select: {
        profileId: true,
        bikeReg: true,
        kycStatus: true,
        kycRef: true,
        kycAttempts: true,
        kycDeclineReason: true,
        // KYC-R26 admin fields: the vendor's last stored status for the current check (kycHeld + display).
        kycVendorStatus: true,
        // Owner 2026-10-15: the selfie flag and its reason.
        selfieCheck: true,
        selfieCheckReason: true,
        selfieCheckAt: true,
        idVerified: true,
        duplicateIdFlag: true,
        verifiedIdHash: true,
        verifiedIdNumber: true,
        updatedAt: true,
        photoUrl: true,
        profile: { select: { firstName: true, lastName: true, phone: true, idNumber: true, idNumberHash: true } },
      },
    });
    if (!rider) return null;

    // The reviewer's whole job is comparing this photo against the applicant fields below — without
    // it they're approving/declining blind. `photoUrl` on the row is the GCS object KEY (uploads.
    // controller mints the write URL at capture time; this mints the matching read URL on demand, so
    // the object store is never public and the URL is only ever live for one review session).
    // Best-effort: a signing failure shouldn't block the rest of the review from loading.
    const photoUrl = rider.photoUrl
      ? await this.storage.createReadUrl(rider.photoUrl, KYC_PHOTO_READ_URL_TTL_SECONDS).catch(() => null)
      : null;

    // A-04 duplicate-account guard: the live set of OTHER accounts sharing this national ID, so the
    // reviewer can compare them before approving (post-IR26-01 a LIVE collision is blocked at claim
    // time, so what shows here is an erased-tombstone returning user or a legacy pre-policy pair).
    // Recomputed here rather than trusting the become-rider snapshot: a colliding account may have
    // been created, edited or deleted since. IR26-04: matches on the TYPED hash and the
    // vendor-VERIFIED document hash, in both directions — a ban-evader who typed a fake number but
    // showed the real document collides through `verifiedIdHash` where the typed hashes disagree.
    // Phones are masked (A-03) — the reviewer matches on the ID, not the phone.
    const idHashes = [...new Set([rider.profile.idNumberHash, rider.verifiedIdHash].filter((h): h is string => !!h))];
    const duplicates = idHashes.length
      ? await this.prisma.profile.findMany({
          where: {
            id: { not: rider.profileId },
            OR: [{ idNumberHash: { in: idHashes } }, { rider: { verifiedIdHash: { in: idHashes } } }],
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            rider: { select: { kycStatus: true, accountStatus: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const duplicateIdAccounts = duplicates.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      phone: maskPhone(p.phone),
      role: p.role,
      kycStatus: p.rider?.kycStatus ?? null,
      accountStatus: p.rider?.accountStatus ?? null,
    }));

    // D-75: a rider can reach review with no national ID on file. New riders type none; the ID check
    // supplies it, and an approval adopts the number it verified (RiderService.settleNationalIdOnApproval).
    // The reviewer sees all of that before approving. With no ID on file, the duplicate set above is
    // exactly the accounts carrying the vendor-verified number; any LIVE one among them (not an erased:<id>
    // tombstone) is what makes the approval refuse.
    const idOnFile = !!rider.profile.idNumberHash;
    const verifiedIdInUse = !idOnFile && !!rider.verifiedIdHash && duplicates.some((p) => !p.phone.startsWith("erased:"));

    // kycAttempts counts declines. The current attempt number is declines + 1 (1 on first review, 2 on
    // the single allowed resubmit). >= 2 declines = locked → support, no further attempts.
    const locked = rider.kycAttempts >= 2;
    return {
      id: rider.profileId,
      name: `${rider.profile.firstName} ${rider.profile.lastName}`.trim(),
      phone: maskPhone(rider.profile.phone),
      // Decrypt for the reviewer — the KYC review is the one place the full national ID is shown (LR8).
      idNumber: this.pii.decryptId(rider.profile.idNumber),
      // Short-lived signed GET URL (or null: no photo yet, or signing failed) — never the raw object
      // key, and never a public bucket URL.
      photoUrl,
      bike: rider.bikeReg,
      status: rider.kycStatus,
      kycRef: rider.kycRef,
      kycAttempts: rider.kycAttempts,
      attempt: Math.min(rider.kycAttempts + 1, 2),
      locked,
      declineReason: rider.kycDeclineReason,
      submittedAt: rider.updatedAt.toISOString(),
      // A-04: the flag persisted at onboarding, and the live collision set the reviewer acts on.
      // duplicateIdFlag reflects onboarding; duplicateIdAccounts.length reflects now — either non-empty
      // means "review the ID before approving".
      duplicateIdFlag: rider.duplicateIdFlag,
      duplicateIdAccounts,
      // IR26-04: true when the vendor-verified document number's hash disagrees with the TYPED national
      // ID — the "typed a fake number, showed a real document" tell. null = unknown (no vendor doc data
      // persisted yet, or no typed ID to compare against), so the console can render tri-state honestly.
      verifiedIdMismatch:
        rider.verifiedIdHash && rider.profile.idNumberHash ? rider.verifiedIdHash !== rider.profile.idNumberHash : null,
      // D-75: false when the account has no national ID on file.
      idOnFile,
      // D-75: the number the ID check verified (D-70 stores it encrypted), decrypted for the reviewer like
      // idNumber above; null when none was stored. With no ID on file, approving adopts it.
      verifiedIdNumber: this.pii.decryptId(rider.verifiedIdNumber),
      // D-75: approving is refused (409 verified_id_in_use) because that number is on another live account.
      verifiedIdInUse,
      // KYC-R26: the check FINISHED at Didit and is held for a human — Didit's own In Review, or a Didit
      // approval WE held (review-band face match, ID collision/mismatch: applyKycResult's holdForReview, which
      // stores "Approved" on a still-pending row). Derived from the stored webhook status exactly as /auth/me
      // derives the rider's "under review" wall (classifyStoredDiditStatus), so console and app agree. The
      // rider owes nothing; the decision is the reviewer's.
      kycHeld: rider.kycStatus === "pending" && classifyStoredDiditStatus(rider.kycVendorStatus) === "held",
      // The raw Didit status string last stored for the current check (e.g. "In Review", "Approved",
      // "Abandoned"), or null when none is stored (no webhook yet, a decided check, an admin reset).
      kycVendorStatus: rider.kycVendorStatus ?? null,
      // Owner 2026-10-15: null = the selfie was checked as normal; `unverified` = verified on the ID with a selfie
      // the camera couldn't make checkable; `recheck_requested` = ops asked for a new one (a reminder, not a gate).
      // The reason is why it was flagged (`camera_quality`), or why the latest re-check didn't pass. Shown whatever
      // the KYC status: a check held for review (an ID collision) can carry the flag too, and the reviewer deciding
      // it must know the face was never checked (owner hold on #1216).
      selfieCheck: rider.selfieCheck ?? null,
      selfieCheckReason: rider.selfieCheckReason ?? null,
      selfieCheckAt: rider.selfieCheckAt ? rider.selfieCheckAt.toISOString() : null,
    };
  }
}
