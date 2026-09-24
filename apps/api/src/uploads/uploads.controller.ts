import { Body, Controller, Inject, Logger, Post, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { STORAGE, type StorageAdapter, type UploadTarget } from "../adapters/storage/storage.interface";
import { MAX_BANNER_PHOTO_BYTES, MAX_DISH_PHOTO_BYTES, MAX_PHOTO_BYTES } from "../adapters/storage/upload-kinds";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { MerchantGuard } from "../merchant/merchant.guard";
import { RestaurantsEnabledGuard } from "../merchant/restaurants-enabled.guard";

// Restrict to the formats expo-image-picker yields, so a signed URL is never minted for an arbitrary
// content type. The PUT must send this exact Content-Type (GCS binds it into the V4 signature; on every
// provider the attach-time UploadVerifier rejects anything that isn't really a JPEG/PNG).
const PhotoUpload = z.object({ contentType: z.enum(["image/jpeg", "image/png"]) });
const EXT: Record<z.infer<typeof PhotoUpload>["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};
// Per-kind size caps (8 MiB photos; D-32's 300 KB dish / 250 KB banner) live in upload-kinds.ts, shared
// with the attach-time check. GCS also binds the cap into the signed URL's X-Goog-Content-Length-Range;
// an Azure SAS can't, so there the attach-time stat is the enforcement.

interface MintedUpload {
  uploadUrl: string;
  key: string;
  headers: Record<string, string>;
}

// DS-07: every mint is a GCP IAM `signBlob` call on a project-shared quota (also used by admin
// KYC-photo and pickup-photo read URLs), so an unthrottled loop can exhaust signing platform-wide.
// A modest per-caller/IP cap on the minting routes; genuine upload flows need only a couple of mints.
@Throttle({ limit: 20, windowSec: 60, keyPrefix: "uploads" })
@Controller("uploads")
@UseGuards(JwtAuthGuard)
export class UploadsController {
  private readonly logger = new Logger(UploadsController.name);

  constructor(@Inject(STORAGE) private readonly storage: StorageAdapter) {}

  /**
   * Mint a short-lived signed PUT URL for the rider's KYC/profile photo. The client uploads the image
   * bytes to `uploadUrl` (with the same Content-Type), then sends the returned `key` to
   * POST /riders/become — the key is what we persist (read URLs are minted on demand later).
   * Key is namespaced by the authenticated user, so one rider can't target another's path.
   */
  @Post("kyc-photo")
  kycPhoto(
    @Body(new ZodBody(PhotoUpload)) body: z.infer<typeof PhotoUpload>,
    @CurrentUser() userId: string,
  ): Promise<MintedUpload> {
    return this.mint(`kyc/${userId}/${randomUUID()}.${EXT[body.contentType]}`, body.contentType);
  }

  /**
   * Mint a short-lived signed PUT URL for the rider's proof-of-pickup photo (§5c "Mark collected
   * (+ pickup photo)"). Same flow as the KYC photo: PUT the bytes to `uploadUrl`, then attach the
   * returned `key` via POST /orders/:id/pickup-photo — which verifies the key sits under the
   * caller's own `pickup/<userId>/` namespace before persisting it.
   */
  @Post("pickup-photo")
  pickupPhoto(
    @Body(new ZodBody(PhotoUpload)) body: z.infer<typeof PhotoUpload>,
    @CurrentUser() userId: string,
  ): Promise<MintedUpload> {
    return this.mint(`pickup/${userId}/${randomUUID()}.${EXT[body.contentType]}`, body.contentType);
  }

  /**
   * Mint a signed PUT URL for the rider's proof-of-drop photo (KB-POD-DISPUTE Phase A). Same flow as the
   * pickup photo: PUT the bytes, then attach the returned `key` (with GPS) via POST
   * /orders/:id/delivery-proof, which verifies the key sits under the caller's own
   * `delivery-proof/<userId>/` namespace before persisting it.
   */
  @Post("delivery-proof")
  deliveryProof(
    @Body(new ZodBody(PhotoUpload)) body: z.infer<typeof PhotoUpload>,
    @CurrentUser() userId: string,
  ): Promise<MintedUpload> {
    return this.mint(`delivery-proof/${userId}/${randomUUID()}.${EXT[body.contentType]}`, body.contentType);
  }

  /**
   * Mint a signed PUT URL for a menu dish photo (D-31/D-32). Gated by RestaurantsEnabledGuard +
   * MerchantGuard on top of the class-level JwtAuthGuard — dormant with the rest of the vertical.
   * Key is namespaced by the caller's own profile id (one profile = at most one Merchant row via
   * the unique ownerProfileId), mirroring kyc-photo/pickup-photo's own-namespace convention.
   */
  @Post("merchant-dish-photo")
  @UseGuards(RestaurantsEnabledGuard, MerchantGuard)
  dishPhoto(
    @Body(new ZodBody(PhotoUpload)) body: z.infer<typeof PhotoUpload>,
    @CurrentUser() profileId: string,
  ): Promise<MintedUpload> {
    return this.mint(`dish/${profileId}/${randomUUID()}.${EXT[body.contentType]}`, body.contentType, MAX_DISH_PHOTO_BYTES);
  }

  /** Mint a signed PUT URL for the shop's cover banner (D-30/D-32). Same gating as dishPhoto. */
  @Post("merchant-banner-photo")
  @UseGuards(RestaurantsEnabledGuard, MerchantGuard)
  bannerPhoto(
    @Body(new ZodBody(PhotoUpload)) body: z.infer<typeof PhotoUpload>,
    @CurrentUser() profileId: string,
  ): Promise<MintedUpload> {
    return this.mint(`banner/${profileId}/${randomUUID()}.${EXT[body.contentType]}`, body.contentType, MAX_BANNER_PHOTO_BYTES);
  }

  /** One minting path for every photo upload — same TTL + adapter-owned header contract; the size cap
   *  is per-call so merchant photos (D-32) can carry a tighter budget than the 8 MiB default. */
  private async mint(
    key: string,
    contentType: z.infer<typeof PhotoUpload>["contentType"],
    maxBytes: number = MAX_PHOTO_BYTES,
  ): Promise<MintedUpload> {
    let target: UploadTarget;
    try {
      target = await this.storage.createUploadUrl(key, contentType, 600, maxBytes);
    } catch (err) {
      // A signing failure (GCS signBlob quota, an Azure delegation-key fetch that failed its one retry)
      // is transient from the client's side: a retryable 503, not a generic 500 (E8).
      this.logger.error(`Upload mint failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException({ reason: "uploads_unavailable", message: "Couldn't upload, try again" });
    }
    return {
      uploadUrl: target.url,
      key: target.key,
      // The adapter owns the provider headers (C1): GCS returns Content-Type + the signed
      // X-Goog-Content-Length-Range, Azure returns Content-Type + x-ms-blob-type. The client echoes
      // them verbatim on the PUT, so it stays decoupled from both the provider and the cap.
      headers: target.headers,
    };
  }
}
