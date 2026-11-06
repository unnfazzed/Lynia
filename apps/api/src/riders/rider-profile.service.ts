import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { PlateStatus, UploadObjectKey } from "@lynia/shared";
import { z } from "zod";
import { auditData } from "../admin/admin.shared";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { isOwnedUploadKey } from "../adapters/storage/upload-kinds";
import { UploadVerifier } from "../adapters/storage/upload-verifier";
import { PrismaService } from "../prisma/prisma.service";
import { domainEvents } from "../common/domain-events";
import { OwnerAlertsService, ownerAlertText } from "../owner-alerts/owner-alerts.service";

/** Manual KYC (D-122): the three document slots and the Rider column each one writes. */
export const KYC_DOC_SLOTS = {
  idFrontKey: "kycIdFrontKey",
  licenceKey: "kycLicenceKey",
  selfieIdKey: "kycSelfieIdKey",
} as const;
export type KycDocSlot = keyof typeof KYC_DOC_SLOTS;
const SLOT_NAMES = Object.keys(KYC_DOC_SLOTS) as KycDocSlot[];

/** A driving licence number as typed: trimmed, single spaces, upper-case, 4–30 characters. */
export const LicenceNumberSchema = z
  .string()
  .trim()
  .min(4)
  .max(30)
  .transform((v) => v.replace(/\s+/g, " ").toUpperCase());

/** A calendar date "YYYY-MM-DD" that really exists (no 2026-02-31). */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid date");

/**
 * A bike plate as `POST /riders/become` validates it (trimmed, 3–20 characters), stored upper-case with
 * single spaces so "aee  4471" and "AEE 4471" read the same on every card that quotes it.
 */
export const BikeRegSchema = z
  .string()
  .trim()
  .min(3, "Bike registration must be at least 3 characters")
  .max(20)
  .transform((v) => v.replace(/\s+/g, " ").toUpperCase());

/**
 * `PATCH /riders/me` (ledger D-79, owner 2026-10-06): the rider adds or changes their photo and bike
 * plate after sign-up, from Bike & documents. Both optional, at least one present; unknown keys refused.
 * `photoUrl` is the storage key `POST /uploads/kyc-photo` minted (the column keeps its old name).
 */
export const UpdateRiderProfile = z
  .object({
    photoUrl: UploadObjectKey.optional(),
    bikeReg: BikeRegSchema.optional(),
    // Manual KYC (D-122): document photo keys from POST /uploads/kyc-photo, and the typed licence.
    idFrontKey: UploadObjectKey.optional(),
    licenceKey: UploadObjectKey.optional(),
    selfieIdKey: UploadObjectKey.optional(),
    licenceNumber: LicenceNumberSchema.optional(),
    licenceExpiresOn: IsoDateSchema.optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), "Nothing to update");
export type UpdateRiderProfile = z.infer<typeof UpdateRiderProfile>;

/** The audit action every self-service change here writes (actor = the rider). */
export const RIDER_PROFILE_UPDATE_ACTION = "rider.profile_update";

/**
 * The rider's own photo + bike plate (D-79). R1 ("Your photo, licence and bike papers can wait") and R3
 * send riders here; before this the screen was read-only and nothing could add either one (review R-8).
 *
 * Separate from RiderService on purpose: none of this touches KYC state. The ID check never verified the
 * plate (D-75: no plate is collected at sign-up), so changing it doesn't reopen the check, and Bike &
 * documents only calls the plate "Verified" while the rider is verified AND has one.
 */
@Injectable()
export class RiderProfileService {
  private readonly logger = new Logger(RiderProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    // StorageModule is @Global, so both are injected in the app. TS-optional only so a unit harness can
    // construct the service with Prisma alone; a missing verifier would skip the attach-time check, so the
    // spec covers the wired path.
    private readonly uploads?: UploadVerifier,
    @Optional() @Inject(STORAGE) private readonly storage?: StorageAdapter,
    @Optional() private readonly ownerAlerts?: OwnerAlertsService,
  ) {}

  async updateProfile(
    profileId: string,
    data: UpdateRiderProfile,
  ): Promise<{ hasPhoto: boolean; bikeReg: string | null; plateStatus: PlateStatus; kycDocs: KycDocsState }> {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId },
      select: {
        photoUrl: true,
        bikeReg: true,
        plateStatus: true,
        kycStatus: true,
        kycAttempts: true,
        kycIdFrontKey: true,
        kycLicenceKey: true,
        kycSelfieIdKey: true,
        kycDocsAlertedAt: true,
        licenceNumber: true,
        licenceExpiresOn: true,
        profile: { select: { firstName: true } },
      },
    });
    if (!rider) throw new NotFoundException("Not a biker");

    // D-122: each document key passes the same two gates as the photo — own namespace first (a rejected
    // verify DELETES the object), then a real JPEG/PNG in budget.
    for (const slot of SLOT_NAMES) {
      const key = data[slot];
      if (key === undefined) continue;
      if (!isOwnedUploadKey("kyc", profileId, key)) throw new BadRequestException("Invalid document key");
      await this.uploads?.verify(key, "kyc");
    }

    // Same rules as becomeRider: the key must sit under the caller's own KYC namespace (so a rider can't
    // point their row at someone else's object), and it must really be a JPEG/PNG in budget. The
    // namespace check comes first because a rejected verify DELETES the object.
    if (data.photoUrl !== undefined) {
      if (!isOwnedUploadKey("kyc", profileId, data.photoUrl)) throw new BadRequestException("Invalid photo key");
      await this.uploads?.verify(data.photoUrl, "kyc");
    }

    const changed: string[] = [];
    if (data.photoUrl !== undefined && data.photoUrl !== rider.photoUrl) changed.push("photo");
    if (data.bikeReg !== undefined && data.bikeReg !== rider.bikeReg) changed.push("bike_reg");
    const replacedDocs: string[] = [];
    for (const slot of SLOT_NAMES) {
      const key = data[slot];
      const current = rider[KYC_DOC_SLOTS[slot]];
      if (key === undefined || key === current) continue;
      changed.push(slot);
      if (current) replacedDocs.push(current);
    }
    if (data.licenceNumber !== undefined && data.licenceNumber !== rider.licenceNumber) changed.push("licence_number");
    const expiry = data.licenceExpiresOn !== undefined ? new Date(`${data.licenceExpiresOn}T00:00:00Z`) : undefined;
    if (expiry && expiry.getTime() !== rider.licenceExpiresOn?.getTime()) changed.push("licence_expiry");

    const docs: KycDocsState = {
      idFront: (data.idFrontKey ?? rider.kycIdFrontKey) != null,
      licence: (data.licenceKey ?? rider.kycLicenceKey) != null,
      selfieId: (data.selfieIdKey ?? rider.kycSelfieIdKey) != null,
    };
    const complete = docs.idFront && docs.licence && docs.selfieId;
    const docsChanged = SLOT_NAMES.some((s) => changed.includes(s));
    // A biker declined for a photo retake (not locked: < 2 strikes) who sends a complete set again goes back
    // into the review queue — the same reopen the manual-mode retry does (FS-2). kycResolvedAt is kept.
    const resubmit = docsChanged && complete && rider.kycStatus === "failed" && rider.kycAttempts < 2;
    // The owner's Telegram hears once per complete set, while the biker is waiting for a manual review.
    const alertDocs = docsChanged && complete && !rider.kycDocsAlertedAt && (rider.kycStatus === "pending" || resubmit);

    if (changed.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.rider.update({
          where: { profileId },
          data: {
            ...(data.photoUrl !== undefined ? { photoUrl: data.photoUrl } : {}),
            // First Run v2 E4 (D-82): a new plate is saved at once and reads "Checking" until ops confirm
            // it (admin plate-verify). Only a real change reopens the check.
            ...(changed.includes("bike_reg") ? { bikeReg: data.bikeReg, plateStatus: PlateStatus.CHECKING } : {}),
            ...(changed.includes("idFrontKey") ? { kycIdFrontKey: data.idFrontKey } : {}),
            ...(changed.includes("licenceKey") ? { kycLicenceKey: data.licenceKey } : {}),
            ...(changed.includes("selfieIdKey") ? { kycSelfieIdKey: data.selfieIdKey } : {}),
            ...(changed.includes("licence_number") ? { licenceNumber: data.licenceNumber } : {}),
            // A new expiry date re-arms the 30-day reminder.
            ...(changed.includes("licence_expiry") ? { licenceExpiresOn: expiry, licenceRemindedAt: null } : {}),
            ...(alertDocs ? { kycDocsAlertedAt: new Date() } : {}),
            ...(resubmit ? { kycStatus: "pending" as const, idVerified: false } : {}),
          },
        });
        // Ops can see who changed what and when (the plate a customer is shown comes from here). The old
        // and new plate go in the note; the photo key does not (it is a storage path, not information).
        const note = changed.includes("bike_reg") ? `bike_reg: ${rider.bikeReg ?? "none"} → ${data.bikeReg}` : null;
        await tx.auditLog.create({ data: auditData(profileId, RIDER_PROFILE_UPDATE_ACTION, profileId, changed.join(","), note) });
        // Admin console v2 §3: the biker funnel's plate step (never the plate itself — the audit note has it).
        if (changed.includes("bike_reg")) {
          await domainEvents.riderStep(tx, profileId, "plate_set", { data: { replaced: rider.bikeReg != null } });
        }
      });
    }

    // The replaced photo is no longer referenced by anything: remove it (best-effort, after the commit,
    // never for a key outside this rider's own namespace).
    const oldPhoto = rider.photoUrl;
    if (changed.includes("photo") && oldPhoto && isOwnedUploadKey("kyc", profileId, oldPhoto) && this.storage) {
      try {
        await this.storage.deleteObject(oldPhoto);
      } catch (err) {
        this.logger.warn(`Couldn't remove replaced biker photo for ${profileId}: ${(err as Error).message}`);
      }
    }

    for (const key of replacedDocs) {
      if (!isOwnedUploadKey("kyc", profileId, key) || !this.storage) continue;
      try {
        await this.storage.deleteObject(key);
      } catch (err) {
        this.logger.warn(`Couldn't remove a replaced document photo for ${profileId}: ${(err as Error).message}`);
      }
    }
    if (alertDocs) this.ownerAlerts?.notify(ownerAlertText.bikerDocsReady({ firstName: rider.profile.firstName }));

    const photoUrl = data.photoUrl ?? rider.photoUrl;
    return {
      hasPhoto: photoUrl != null,
      bikeReg: data.bikeReg ?? rider.bikeReg,
      plateStatus: changed.includes("bike_reg") ? PlateStatus.CHECKING : rider.plateStatus,
      kycDocs: docs,
    };
  }
}

/** Which manual-KYC document photos the biker has on file (never the keys themselves). */
export interface KycDocsState {
  idFront: boolean;
  licence: boolean;
  selfieId: boolean;
}
