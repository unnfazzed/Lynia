import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodBody } from "../common/zod.pipe";

// Restrict to the formats expo-image-picker yields, so a signed URL is never minted for an arbitrary
// content type. The PUT must send this exact Content-Type or the V4 signature won't match.
const KycPhotoUpload = z.object({ contentType: z.enum(["image/jpeg", "image/png"]) });
const EXT: Record<z.infer<typeof KycPhotoUpload>["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};
// Cap a KYC/profile photo at 8 MiB — well above a phone-camera JPEG/PNG, far below storage-abuse/DoS
// territory. Bound into the signed URL so the object store rejects anything larger, not just the client.
const MAX_KYC_PHOTO_BYTES = 8 * 1024 * 1024;

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
  async kycPhoto(
    @Body(new ZodBody(KycPhotoUpload)) body: z.infer<typeof KycPhotoUpload>,
    @CurrentUser() userId: string,
  ): Promise<{ uploadUrl: string; key: string; headers: Record<string, string> }> {
    const key = `kyc/${userId}/${randomUUID()}.${EXT[body.contentType]}`;
    const target = await this.storage.createUploadUrl(key, body.contentType, 600, MAX_KYC_PHOTO_BYTES);
    return {
      uploadUrl: target.url,
      key: target.key,
      // The signed URL binds BOTH the content-type and a size range, so the PUT must send these exact
      // headers or the V4 signature won't match. Returned so the client stays decoupled from the cap.
      headers: {
        "Content-Type": body.contentType,
        "X-Goog-Content-Length-Range": `0,${MAX_KYC_PHOTO_BYTES}`,
      },
    };
  }
}
