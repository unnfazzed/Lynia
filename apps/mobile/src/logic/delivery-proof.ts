import type { DoorProofReason } from "@lynia/shared";
import { attachFoodDoorProof } from "../api/food-rider";
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

/**
 * Order flow v2 RD4c/RD4d (ledger D-59): a merchant order's door photo when the delivery code can't be
 * used — the same mint → signed PUT, then attached with why and who through the merchant-order route.
 * Evidence only: it never finishes the delivery.
 */
export async function uploadFoodDoorProof(
  orderId: string,
  asset: UploadImageSource,
  door: { reason: DoorProofReason; handedTo?: string },
  coords?: { lat: number; lng: number },
): Promise<void> {
  const prepared = await downscaleForUpload(asset);
  const { uploadUrl, key, headers } = await requestDeliveryProofUpload(prepared.contentType);
  await uploadImage(uploadUrl, prepared.uri, headers ?? { "Content-Type": prepared.contentType });
  await attachFoodDoorProof(orderId, { key, reason: door.reason, ...(door.handedTo ? { handedTo: door.handedTo } : {}), ...coords });
}
