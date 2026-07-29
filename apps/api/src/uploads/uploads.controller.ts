import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { MerchantGuard } from "../merchant/merchant.guard";
import { RestaurantsEnabledGuard } from "../merchant/restaurants-enabled.guard";

// Restrict to the formats expo-image-picker yields, so a signed URL is never minted for an arbitrary
// content type. The PUT must send this exact Content-Type or the V4 signature won't match.
const PhotoUpload = z.object({ contentType: z.enum(["image/jpeg", "image/png"]) });
const EXT: Record<z.infer<typeof PhotoUpload>["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};
// Cap an uploaded photo at 8 MiB — well above a phone-camera JPEG/PNG, far below storage-abuse/DoS
// territory. Bound into the signed URL so the object store rejects anything larger, not just the client.
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
// D-32 "we compress on the merchant's behalf and say so": these are the target sizes named in the
// design contract, enforced the same way as MAX_PHOTO_BYTES — bound into the signed URL's
// X-Goog-Content-Length-Range so the object store rejects an over-budget PUT, not just the client's
// own downscale step (apps/mobile/src/logic/image-downscale.ts, which already lands most photos in
// this range but never guarantees it).
const MAX_DISH_PHOTO_BYTES = 300 * 1024;
const MAX_BANNER_PHOTO_BYTES = 250 * 1024;

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

  /** One minting path for every photo upload — same TTL + signed-header contract; the size cap is
   *  per-call so merchant photos (D-32) can carry a tighter budget than the 8 MiB default. */
  private async mint(
    key: string,
    contentType: z.infer<typeof PhotoUpload>["contentType"],
    maxBytes: number = MAX_PHOTO_BYTES,
  ): Promise<MintedUpload> {
    const target = await this.storage.createUploadUrl(key, contentType, 600, maxBytes);
    return {
      uploadUrl: target.url,
      key: target.key,
      // The signed URL binds BOTH the content-type and a size range, so the PUT must send these exact
      // headers or the V4 signature won't match. Returned so the client stays decoupled from the cap.
      headers: {
        "Content-Type": contentType,
        "X-Goog-Content-Length-Range": `0,${maxBytes}`,
      },
    };
  }
}
