import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  AttachMerchantDoorProofRequest,
  AttachMerchantPickupProofRequest,
  DoorProofReason,
  MerchantDoorProofView,
  MerchantPickupProofView,
} from "@lynia/shared";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import { PICKUP_PHOTO_STATUSES } from "../orders/order-lifecycle.constants";
import { OrderLifecycleService } from "../orders/order-lifecycle.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { notifyFoodQueueChanged } from "./merchant-lookup.util";

/**
 * Order flow v2 proof at hand-over (BRIEF §9, handoff RD2b–d, RD4c–d, M4/M4b, M5b, P5; ledger D-59).
 *
 * Pickup: the rider ticks "Bag is sealed" and photographs the bag at the counter. The photo travels the
 * parcel flow's own path — `POST /uploads/pickup-photo` (signed PUT under `pickup/<riderId>/`), then the
 * key is attached here, which reuses {@link OrderLifecycleService.attachPickupPhoto} verbatim (upload
 * verification, row lock, own-namespace check, retake cleanup) and adds the merchant-order extras: when
 * it was taken and the sealed tick. Required for shops (pharmacy included) before pickup completes
 * ({@link assertPickupProofIfRequired}), optional for restaurants.
 *
 * Door: when the delivery code can't be used, the rider says why, who it was handed to, and photographs
 * where it was left — `POST /uploads/delivery-proof`, then attached here through
 * {@link OrderLifecycleService.attachDeliveryProof} (the KB-POD-DISPUTE evidence columns) plus the reason
 * and the name. It is evidence only: it never moves the order's status (finishing a delivery without the
 * code stays the ops adjudication path).
 *
 * Both are surfaced, with short-lived signed URLs, on the customer's, merchant's and rider's
 * single-order reads ({@link proofViews}).
 */
@Injectable()
export class MerchantOrderProofService {
  private readonly logger = new Logger(MerchantOrderProofService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly gateway: TrackingGateway,
  ) {}

  async attachPickupProof(
    orderId: string,
    riderId: string,
    body: AttachMerchantPickupProofRequest,
  ): Promise<{ orderId: string; photoAttached: boolean; bagSealed: boolean }> {
    const order = await this.findOwnMerchantJob(orderId, riderId);
    if (body.key !== undefined) {
      await this.lifecycle.attachPickupPhoto(orderId, riderId, body.key);
    } else if (!PICKUP_PHOTO_STATUSES.includes(order.status as (typeof PICKUP_PHOTO_STATUSES)[number])) {
      throw new ConflictException("The bag can only be ticked while collecting the order");
    }
    const data: Prisma.OrderUpdateManyMutationInput = {};
    if (body.key !== undefined) data.pickupPhotoAt = new Date();
    if (body.bagSealed !== undefined) data.pickupBagSealed = body.bagSealed;
    await this.prisma.order.updateMany({ where: { id: orderId, riderId }, data });
    const after = await this.prisma.order.findUnique({ where: { id: orderId }, select: { pickupPhotoKey: true, pickupBagSealed: true } });
    // M4b: the merchant's "Hand over" waits for this photo — move their screen now.
    notifyFoodQueueChanged(this.gateway, order.merchantId, orderId);
    return { orderId, photoAttached: !!after?.pickupPhotoKey, bagSealed: !!after?.pickupBagSealed };
  }

  async attachDoorProof(
    orderId: string,
    riderId: string,
    body: AttachMerchantDoorProofRequest,
  ): Promise<{ orderId: string; reason: DoorProofReason; handedTo: string | null }> {
    const order = await this.findOwnMerchantJob(orderId, riderId);
    if (body.reason === "handed_to_someone_else" && !body.handedTo) {
      throw new ConflictException({ reason: "handed_to_required", message: "Who did you hand it to?" });
    }
    await this.lifecycle.attachDeliveryProof(orderId, riderId, body.key, body.lat, body.lng);
    await this.prisma.order.updateMany({
      where: { id: orderId, riderId },
      data: { deliveryProofReason: body.reason, deliveryProofHandedTo: body.handedTo ?? null },
    });
    notifyFoodQueueChanged(this.gateway, order.merchantId, orderId);
    try {
      // The customer's P5 row and the merchant's M5b: nudge open order screens to refetch.
      this.gateway.emitOrderStatus(orderId, order.status);
    } catch (err) {
      this.logger.warn(`status emit failed for order ${orderId}: ${(err as Error).message}`);
    }
    return { orderId, reason: body.reason, handedTo: body.handedTo ?? null };
  }

  private async findOwnMerchantJob(orderId: string, riderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, orderType: "merchant" },
      select: { riderId: true, status: true, merchantId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.riderId !== riderId) throw new ForbiddenException("Not the assigned rider");
    return order;
  }
}

/**
 * BRIEF §9: a shop's (pharmacy included) order can't be collected until the rider's photo of the bag is
 * attached. Restaurants: optional, no check. Runs inside the pickup transaction, under the order row lock
 * the pickup paths already hold, so the check and the status change are one decision.
 */
export async function assertPickupProofIfRequired(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ pickup_photo_key: string | null; business_type: string | null }>>`
    SELECT o.pickup_photo_key, m.business_type::text AS business_type
    FROM orders o LEFT JOIN merchants m ON m.id = o.merchant_id
    WHERE o.id = ${orderId}::uuid`;
  const o = rows[0];
  if (o?.business_type === "shop" && !o.pickup_photo_key) {
    throw new ConflictException({
      reason: "pickup_photo_required",
      message: "Take a photo of the sealed bag before you collect the order.",
    });
  }
}

/** Read URLs live as long as the parcel pickup photo's (orders.service PICKUP_PHOTO_READ_URL_TTL_SECONDS). */
const PROOF_READ_URL_TTL_SECONDS = 900;

export interface ProofSource {
  pickupPhotoKey: string | null;
  pickupPhotoAt: Date | null;
  pickupBagSealed: boolean | null;
  deliveryProofKey: string | null;
  deliveryProofAt: Date | null;
  deliveryProofReason: string | null;
  deliveryProofHandedTo: string | null;
}

/** The pickup and door proof as the wire shape, with signed read URLs minted on demand (never stored).
 *  Best-effort: a storage blip serves a null URL, never a failed read. Each is null when there's nothing. */
export async function proofViews(
  storage: StorageAdapter | undefined,
  o: ProofSource,
): Promise<{ pickupProof: MerchantPickupProofView | null; doorProof: MerchantDoorProofView | null }> {
  const sign = async (key: string | null): Promise<string | null> => {
    if (!key || !storage) return null;
    return storage.createReadUrl(key, PROOF_READ_URL_TTL_SECONDS).catch(() => null);
  };
  const [pickupUrl, doorUrl] = await Promise.all([sign(o.pickupPhotoKey), sign(o.deliveryProofKey)]);
  const pickupProof =
    o.pickupPhotoKey || o.pickupBagSealed != null
      ? { photoUrl: pickupUrl, takenAt: o.pickupPhotoAt?.toISOString() ?? null, bagSealed: o.pickupBagSealed === true }
      : null;
  const doorProof = o.deliveryProofKey
    ? {
        photoUrl: doorUrl,
        takenAt: o.deliveryProofAt?.toISOString() ?? null,
        reason: isDoorProofReason(o.deliveryProofReason) ? o.deliveryProofReason : null,
        handedTo: o.deliveryProofHandedTo,
      }
    : null;
  return { pickupProof, doorProof };
}

function isDoorProofReason(r: string | null): r is DoorProofReason {
  return r === "customer_unreachable" || r === "handed_to_someone_else" || r === "left_at_gate";
}
