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
  ): Promise<{ uploadUrl: string; key: string }> {
    const key = `kyc/${userId}/${randomUUID()}.${EXT[body.contentType]}`;
    const target = await this.storage.createUploadUrl(key, body.contentType, 600);
    return { uploadUrl: target.url, key: target.key };
  }
}
