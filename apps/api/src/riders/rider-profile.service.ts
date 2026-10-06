import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { PlateStatus } from "@lynia/shared";
import { z } from "zod";
import { auditData } from "../admin/admin.shared";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { UploadVerifier } from "../adapters/storage/upload-verifier";
import { PrismaService } from "../prisma/prisma.service";

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
    photoUrl: z.string().min(1).max(256).optional(),
    bikeReg: BikeRegSchema.optional(),
  })
  .strict()
  .refine((b) => b.photoUrl !== undefined || b.bikeReg !== undefined, "Nothing to update");
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
  ) {}

  async updateProfile(profileId: string, data: UpdateRiderProfile): Promise<{ hasPhoto: boolean; bikeReg: string | null; plateStatus: PlateStatus }> {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId },
      select: { photoUrl: true, bikeReg: true, plateStatus: true },
    });
    if (!rider) throw new NotFoundException("Not a rider");

    // Same rules as becomeRider: the key must sit under the caller's own KYC namespace (so a rider can't
    // point their row at someone else's object), and it must really be a JPEG/PNG in budget. The
    // namespace check comes first because a rejected verify DELETES the object.
    if (data.photoUrl !== undefined) {
      if (!data.photoUrl.startsWith(`kyc/${profileId}/`)) throw new BadRequestException("Invalid photo key");
      await this.uploads?.verify(data.photoUrl, "kyc");
    }

    const changed: string[] = [];
    if (data.photoUrl !== undefined && data.photoUrl !== rider.photoUrl) changed.push("photo");
    if (data.bikeReg !== undefined && data.bikeReg !== rider.bikeReg) changed.push("bike_reg");

    if (changed.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.rider.update({
          where: { profileId },
          data: {
            ...(data.photoUrl !== undefined ? { photoUrl: data.photoUrl } : {}),
            // First Run v2 E4 (D-80): a new plate is saved at once and reads "Checking" until ops confirm
            // it (admin plate-verify). Only a real change reopens the check.
            ...(changed.includes("bike_reg") ? { bikeReg: data.bikeReg, plateStatus: PlateStatus.CHECKING } : {}),
          },
        });
        // Ops can see who changed what and when (the plate a customer is shown comes from here). The old
        // and new plate go in the note; the photo key does not (it is a storage path, not information).
        const note = changed.includes("bike_reg") ? `bike_reg: ${rider.bikeReg ?? "none"} → ${data.bikeReg}` : null;
        await tx.auditLog.create({ data: auditData(profileId, RIDER_PROFILE_UPDATE_ACTION, profileId, changed.join(","), note) });
      });
    }

    // The replaced photo is no longer referenced by anything: remove it (best-effort, after the commit,
    // never for a key outside this rider's own namespace).
    const oldPhoto = rider.photoUrl;
    if (changed.includes("photo") && oldPhoto && oldPhoto.startsWith(`kyc/${profileId}/`) && this.storage) {
      try {
        await this.storage.deleteObject(oldPhoto);
      } catch (err) {
        this.logger.warn(`Couldn't remove replaced rider photo for ${profileId}: ${(err as Error).message}`);
      }
    }

    const photoUrl = data.photoUrl ?? rider.photoUrl;
    return {
      hasPhoto: photoUrl != null,
      bikeReg: data.bikeReg ?? rider.bikeReg,
      plateStatus: changed.includes("bike_reg") ? PlateStatus.CHECKING : rider.plateStatus,
    };
  }
}
