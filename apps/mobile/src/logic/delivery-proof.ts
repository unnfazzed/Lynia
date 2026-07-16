import { attachDeliveryProof } from "../api/orders";
import { requestDeliveryProofUpload, uploadImage } from "../api/uploads";
import { downscaleForUpload, type UploadImageSource } from "./image-downscale";

/**
 * KB-POD-DISPUTE Phase A — proof-of-drop capture orchestration, extracted from the UI so the
 * mint → signed-PUT → attach sequence is unit-testable (the camera + permission + GPS steps stay in the
 * component). Mirrors PickupChecklist.uploadPhoto. `coords` is the rider's GPS at the door — optional,
 * because a denied/failed location fix must never block attaching the photo evidence. Throws on any leg
 * so the caller can render its calm inline error; it NEVER gates the undelivered decision.
 */
export async function uploadDeliveryProof(
  orderId: string,
  asset: UploadImageSource,
  coords?: { lat: number; lng: number },
): Promise<void> {
  const prepared = await downscaleForUpload(asset);
  const { uploadUrl, key, headers } = await requestDeliveryProofUpload(prepared.contentType);
  await uploadImage(uploadUrl, prepared.uri, headers ?? { "Content-Type": prepared.contentType });
  await attachDeliveryProof(orderId, key, coords);
}
