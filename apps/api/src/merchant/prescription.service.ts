import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  addMoney,
  type DeclinePrescriptionRequest,
  foodOrderMoney,
  fromCents,
  recomputeMerchantDeliveryShare,
  type PrescriptionInput,
  type PrescriptionPhotosResponse,
  rejectionCopy,
  smallOrderFeeForSubtotal,
  toCents,
} from "@lynia/shared";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { isOwnedUploadKey } from "../adapters/storage/upload-kinds";
import { UploadVerifier } from "../adapters/storage/upload-verifier";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { pushCopy, PUSH_C } from "../notifications/merchant-order-push";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { notifyFoodQueueChanged, resolveOwnMerchantId } from "./merchant-lookup.util";

/** How long a prescription photo read URL lives — long enough to zoom and read, short enough to not leak. */
export const RX_PHOTO_READ_URL_TTL_SECONDS = 300;

/** Kitchen phases a prescription can still be checked in (before the order is packed). */
const CHECKABLE_PHASES: ReadonlySet<string> = new Set(["awaiting_accept", "preparing"]);

/** Statuses the rider ticks "I saw the original" in: they have the order and haven't handed it over. */
const RIDER_TICK_STATUSES: ReadonlySet<string> = new Set(["picked_up", "en_route_dropoff"]);

/**
 * Order flow v2 (ledger D-59, BRIEF §13) — prescriptions, behind RX_ENABLED (default off).
 *
 *  - Placement: an order with "Prescription needed" lines is refused while the flag is off, and needs a
 *    prescription (1–3 photo keys under the customer's own `rx/` namespace, patient name, consent) while
 *    it's on. {@link prepareForPlacement} is called by FoodOrderService.placeOrder.
 *  - The pharmacist check (M8): a team member with `isPharmacist` approves, or declines with a reason
 *    (Unreadable · Expired · Not valid for this medicine · Other + note). A decline takes the Rx lines off
 *    and re-prices the rest; if nothing is left the order is cancelled (nothing charged). The merchant
 *    can't mark the order packed while the check is pending (FoodOrderService.markReady).
 *  - The rider's "I saw the original prescription" tick at the door (RD3), required before delivery
 *    completes on an approved prescription (OrderLifecycleService.confirmDelivery).
 *  - Photos are read through short-lived signed URLs, for the order's customer, its pharmacy and admin.
 */
@Injectable()
export class PrescriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    @Optional() @Inject(ENV) private readonly env?: Env,
    // @Global (StorageModule); absent only in unit harnesses, like MerchantService's.
    @Optional() private readonly uploads?: UploadVerifier,
  ) {}

  get rxEnabled(): boolean {
    return this.env?.RX_ENABLED === "true";
  }

  /**
   * Placement rules for the basket's "Prescription needed" lines. Returns the prescription row to create
   * with the order (or null when the order has no Rx lines). Throws a 409 with a `reason` the app routes on.
   */
  async prepareForPlacement(
    customerId: string,
    merchant: { id: string; shopKind: string | null },
    rxLines: number,
    prescription: PrescriptionInput | undefined,
  ): Promise<Omit<Prisma.OrderPrescriptionCreateWithoutOrderInput, "order"> | null> {
    if (rxLines === 0) {
      if (prescription) throw new BadRequestException({ reason: "prescription_not_needed", message: "Nothing in this order needs a prescription." });
      return null;
    }
    // MJ-H5 / U43: a pharmacy with nobody ticked as pharmacist can't check a prescription, so the order
    // could never be packed and the customer couldn't cancel it. Refused here, like RX_ENABLED off (the
    // customer read hides its Rx items too, MerchantService.rxVisible).
    const hasPharmacist =
      this.rxEnabled &&
      merchant.shopKind === "pharmacy" &&
      (await this.prisma.merchantMember.count({ where: { merchantId: merchant.id, isPharmacist: true } })) > 0;
    if (!hasPharmacist) {
      throw new ConflictException({ reason: "rx_unavailable", message: "Prescription medicines can't be ordered in the app yet." });
    }
    if (!prescription) {
      throw new ConflictException({ reason: "prescription_required", message: "Add a photo of your prescription to place this order" });
    }
    for (const key of prescription.photoKeys) {
      // The namespace check comes first: a failed verification deletes the object.
      if (!isOwnedUploadKey("rx", customerId, key)) throw new BadRequestException("Invalid photo key");
    }
    for (const key of prescription.photoKeys) await this.uploads?.verify(key, "rx");
    return { photoKeys: [...prescription.photoKeys], patientName: prescription.patientName, consentAt: new Date(), status: "pending" };
  }

  /** The caller must be a pharmacist on this order's pharmacy. Returns the merchant id. */
  private async requirePharmacist(profileId: string, orderId: string): Promise<{ merchantId: string }> {
    const merchantId = await resolveOwnMerchantId(this.prisma, profileId);
    const member = await this.prisma.merchantMember.findUnique({
      where: { profileId_merchantId: { profileId, merchantId } },
      select: { isPharmacist: true },
    });
    const order = await this.prisma.order.findFirst({ where: { id: orderId, merchantId, orderType: "merchant" }, select: { id: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (!member?.isPharmacist) {
      throw new ForbiddenException({ reason: "not_pharmacist", message: "Only a pharmacist on your team can check prescriptions." });
    }
    return { merchantId };
  }

  /** M8a "Approve prescription". Idempotent on an already-approved one. */
  async approve(profileId: string, orderId: string, checklist?: { nameMatches: true; signedStamped: true; recentDate: true }): Promise<void> {
    const { merchantId } = await this.requirePharmacist(profileId, orderId);
    const rx = await this.loadCheckable(orderId);
    if (rx.status === "approved") return;
    if (rx.status !== "pending") throw new ConflictException({ reason: "prescription_checked", message: "This prescription was already declined." });
    const claimed = await this.prisma.orderPrescription.updateMany({
      where: { orderId, status: "pending" },
      data: { status: "approved", checkedAt: new Date(), checkedByProfileId: profileId, ...(checklist ? { checklist } : {}) },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    notifyFoodQueueChanged(this.gateway, merchantId, orderId);
  }

  /**
   * M8b "Decline and tell the customer": takes the Rx lines off and re-prices what's left (small-order fee
   * re-applied, delivery fee unchanged). With nothing left the order is cancelled — nothing was charged
   * (cash on delivery). Otherwise the rest carries on; the customer may "Cancel the rest — free"
   * (FoodOrderService.cancelUnpaid allows it after a decline).
   */
  async decline(profileId: string, orderId: string, body: DeclinePrescriptionRequest): Promise<void> {
    const { merchantId } = await this.requirePharmacist(profileId, orderId);
    const rx = await this.loadCheckable(orderId);
    if (rx.status !== "pending") throw new ConflictException({ reason: "prescription_checked", message: "This prescription was already checked." });
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customerId: true,
        status: true,
        merchantPhase: true,
        deliveryFee: true,
        merchantDeliveryShare: true,
        merchantItems: true,
        merchant: { select: { name: true } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    const kept = order.merchantItems.filter((it) => it.available !== false && !it.rxRequired);
    const now = new Date();
    let cancelled = false;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.orderPrescription.updateMany({
        where: { orderId, status: "pending" },
        data: {
          status: "declined",
          declineReason: body.reason,
          declineNote: body.note ?? null,
          checkedAt: now,
          checkedByProfileId: profileId,
          ...(body.checklist ? { checklist: body.checklist } : {}),
        },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      await tx.merchantOrderItem.updateMany({ where: { orderId, rxRequired: true }, data: { available: false } });
      if (kept.length === 0) {
        const c = await tx.order.updateMany({
          where: { id: orderId, status: "requested", merchantPhase: order.merchantPhase },
          data: { status: "cancelled", cancelledAt: now, rejectionReason: "rx_declined", merchantPhase: null },
        });
        if (c.count === 0) throw new ConflictException("Order changed, retry");
        await tx.orderEvent.create({ data: { orderId, status: "cancelled" } });
        cancelled = true;
        return;
      }
      const rawSubtotal = addMoney(...kept.map((it) => fromCents(toCents(Number(it.priceUsd)) * it.quantity)));
      const merchantGoodsTotal = addMoney(rawSubtotal, smallOrderFeeForSubtotal(rawSubtotal));
      const deliveryFee = Number(order.deliveryFee ?? 0);
      // D-71: a free-delivery order stays free, the venue's share capped by the smaller goods total.
      const merchantDeliveryShare = recomputeMerchantDeliveryShare(order.merchantDeliveryShare, merchantGoodsTotal, deliveryFee);
      const agreedFare = foodOrderMoney({ goodsTotal: merchantGoodsTotal, deliveryFee, merchantDeliveryShare }).customerTotal;
      const u = await tx.order.updateMany({
        where: { id: orderId, status: "requested", merchantPhase: order.merchantPhase },
        data: { merchantGoodsTotal, merchantDeliveryShare, agreedFare, itemsEditedAt: now },
      });
      if (u.count === 0) throw new ConflictException("Order changed, retry");
    });
    notifyFoodQueueChanged(this.gateway, merchantId, orderId);
    // Order flow v2 G3a (O.g.push.c[10]); with nothing left to pack, the cancellation's own sentence.
    const drawn = pushCopy(PUSH_C.rxDeclined, {});
    void this.notifications.notifyProfiles([order.customerId], {
      title: drawn.title,
      body: cancelled ? rejectionCopy("rx_declined") : drawn.body,
      data: { orderId, status: cancelled ? "cancelled" : "requested", to: "customer", orderType: "merchant", kind: "food_rx_declined" },
    });
  }

  private async loadCheckable(orderId: string): Promise<{ status: string }> {
    const rx = await this.prisma.orderPrescription.findUnique({
      where: { orderId },
      select: { status: true, order: { select: { status: true, merchantPhase: true } } },
    });
    if (!rx) throw new NotFoundException({ reason: "no_prescription", message: "This order has no prescription." });
    if (rx.order.status !== "requested" || !rx.order.merchantPhase || !CHECKABLE_PHASES.has(rx.order.merchantPhase)) {
      throw new ConflictException({ reason: "not_checkable", message: "This order is past the prescription check." });
    }
    return rx;
  }

  /** RD3 "I saw the original prescription" — the assigned rider, at the door. Idempotent. */
  async riderSawOriginal(orderId: string, riderId: string): Promise<{ orderId: string; riderSawOriginalAt: string }> {
    const rx = await this.prisma.orderPrescription.findUnique({
      where: { orderId },
      select: { status: true, riderSawOriginalAt: true, order: { select: { riderId: true, status: true } } },
    });
    if (!rx) throw new NotFoundException({ reason: "no_prescription", message: "This order has no prescription." });
    if (rx.order.riderId !== riderId) throw new ForbiddenException("Not the assigned rider");
    if (rx.riderSawOriginalAt) return { orderId, riderSawOriginalAt: rx.riderSawOriginalAt.toISOString() };
    if (!RIDER_TICK_STATUSES.has(rx.order.status)) throw new ConflictException("Tick this at the customer's door.");
    const now = new Date();
    await this.prisma.orderPrescription.updateMany({ where: { orderId, riderSawOriginalAt: null }, data: { riderSawOriginalAt: now } });
    return { orderId, riderSawOriginalAt: now.toISOString() };
  }

  /** The prescription's pages as signed read URLs. `viewer` has already been resolved by the caller's route. */
  async photos(orderId: string, viewer: { customerId: string } | { merchantProfileId: string } | { admin: true }): Promise<PrescriptionPhotosResponse> {
    const rx = await this.prisma.orderPrescription.findUnique({
      where: { orderId },
      select: { photoKeys: true, order: { select: { customerId: true, merchantId: true } } },
    });
    if (!rx) throw new NotFoundException("Order not found");
    if ("customerId" in viewer && rx.order.customerId !== viewer.customerId) throw new NotFoundException("Order not found");
    if ("merchantProfileId" in viewer) {
      const merchantId = await resolveOwnMerchantId(this.prisma, viewer.merchantProfileId);
      if (rx.order.merchantId !== merchantId) throw new NotFoundException("Order not found");
    }
    const photos = await Promise.all(
      rx.photoKeys.map(async (key, i) => ({ page: i + 1, url: await this.storage.createReadUrl(key, RX_PHOTO_READ_URL_TTL_SECONDS) })),
    );
    return { photos, expiresInSeconds: RX_PHOTO_READ_URL_TTL_SECONDS };
  }
}
