import { ConflictException, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import { deriveMerchantOrderTrack, RESTAURANTS_TIMING } from "@lynia/shared";
import { PAYMENT_RAIL, type PaymentRail } from "../adapters/payments/payment-rail.interface";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { TokenService } from "../auth/token.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { FoodDebtService } from "./food-debt.service";
import { notifyFoodQueueChanged } from "./merchant-lookup.util";
import { MicroCache } from "../common/micro-cache";
import { MicroCacheL2Provider } from "../common/micro-cache-l2.provider";
import { MetricsService } from "../observability/metrics.service";
import { OrderSubstitutionService } from "./order-substitution.service";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { OrderScheduleService } from "./order-schedule.service";
import { PrescriptionService } from "./prescription.service";
import { OwnerAlertsService } from "../owner-alerts/owner-alerts.service";
import { FoodOrderPlacing } from "./food-order.placing";
import { FoodOrderLifecycle } from "./food-order.lifecycle";
import { FoodOrderViews } from "./food-order.views";


export { PREP_EXTEND_MIN, HANDOVER_LINK_TTL_S, PREP_MAX_MIN, pickupRevealWhere, noRiderHeld, readyPhaseFor } from "./food-order.helpers";

/**
 * C2 — food order lifecycle (pre-dispatch). Owns the `requested` phase of a merchant order end to
 * end: placement → merchant accept (full or item-level, D-23) → payment-confirm-before-cook (R-11) →
 * prep → ready. Once `ready_for_pickup`, the hand-off to C3's dispatch (broadcasting to
 * open_for_offers, assigning a rider) is deliberately NOT this service's job — see
 * order-lifecycle.transitions.ts's MERCHANT_PHASE_TRANSITIONS "ready_for_pickup has no outgoing
 * edge" note. `confirmPickup` is wired ahead of that dependency (mechanic only needs an assigned
 * rider, not the dispatch algorithm) so it's ready the moment C3 lands.
 */
@Injectable()
export class FoodOrderService implements OnModuleInit, OnModuleDestroy {
  readonly logger = new Logger(FoodOrderService.name);
  private sweep?: ReturnType<typeof setInterval>;

  // C4 (MJ-P3 + P03): read-URL micro-caches for the single-order reads, keyed by OBJECT KEY — the
  // OrdersService.pickupPhotoUrlCache / MerchantService.photoUrlCache pattern. The customer, merchant
  // and rider order screens poll every 4–15 s; minting per read handed each poll a new V4 signature,
  // so the device image cache missed and the photo downloaded again every poll. Cached, a URL is
  // byte-stable until its entry expires at 2/3 of the signed validity (with the ±10% jitter a served
  // URL keeps ≥4 min of 15 for proof, ≥8.6 h of 24 for swap photos), then the next read re-signs. A
  // retaken photo has a new uuid key, so it never inherits the old photo's URL. L2 prefixes match the
  // sibling caches on purpose — same key, same signed TTL — so the parcel snapshot, the menu and this
  // read hand a phone one URL per photo when the shared Redis L2 is on.
  readonly proofPhotoUrlCache = new MicroCache<string>(500, {
    ttlJitterRatio: 0.1,
    onEvent: (o) => this.metricsSvc?.recordMicroCache("proof_photo_url", o),
    l2: () => this.l2?.resolve() ?? null,
    l2KeyPrefix: "mc:photo:",
  });
  readonly swapPhotoUrlCache = new MicroCache<string>(500, {
    ttlJitterRatio: 0.1,
    onEvent: (o) => this.metricsSvc?.recordMicroCache("swap_photo_url", o),
    l2: () => this.l2?.resolve() ?? null,
    l2KeyPrefix: "mc:mphoto:",
  });
  // R-6 (QA 2026-10-20): the methods live in three parts — placing (the customer's side up to the kitchen),
  // lifecycle (the kitchen, the biker and the sweeps) and views (reads, the response shape, lookups, pushes).
  // This class keeps the state and the Nest hooks and delegates, so every caller and spec is unchanged.
  private readonly placing = new FoodOrderPlacing(this);
  private readonly lifecycle = new FoodOrderLifecycle(this);
  private readonly views = new FoodOrderViews(this);

  constructor(
    readonly prisma: PrismaService,
    readonly tokens: TokenService,
    readonly notifications: NotificationsService,
    readonly debt: FoodDebtService,
    readonly gateway: TrackingGateway,
    // #670: the mobile-money rail seam (roadmap 2.5). Default binding is the inert StubPaymentRail —
    // it returns `pending` and never fabricates a `confirmed`, so wiring it here can never mark an
    // order paid without a real rail. The idempotency anchor is the order id (topUpId param).
    @Inject(PAYMENT_RAIL) readonly paymentRail: PaymentRail,
    // Order flow v2 (D-59). @Optional so the existing positional unit harnesses keep constructing the
    // service; Nest always injects both in production (StorageModule is @Global).
    @Optional() readonly substitutions?: OrderSubstitutionService,
    @Optional() @Inject(STORAGE) readonly storage?: StorageAdapter,
    // Order flow v2 (ledger D-59, backend B). Optional so the hand-built unit harnesses stay valid: without an env the
    // shop sections and RX_ENABLED read as off; without the two services, a placement that needs them
    // (a scheduled or prescription order) is refused.
    @Optional() @Inject(ENV) readonly env?: Env,
    @Optional() private readonly schedule?: OrderScheduleService,
    @Optional() private readonly prescriptions?: PrescriptionService,
    // C4: the photo-URL caches' metrics and shared L2 — both @Global-provided, optional like the rest.
    @Optional() private readonly metricsSvc?: MetricsService,
    @Optional() private readonly l2?: MicroCacheL2Provider,
    // D2 (owner 2026-10-07): seals the pickup code next to its hash so a reveal is repeatable. @Global in
    // the app; optional only for the positional unit harnesses (without it a row is hash-only, pre-D2).
    @Optional() readonly codeCrypto?: PiiCryptoService,
    // The owner's new-order alert. @Global (OwnerAlertsModule); optional like the rest.
    @Optional() readonly ownerAlerts?: OwnerAlertsService,
  ) {}

  microCacheBypassed(...args: Parameters<FoodOrderViews["microCacheBypassed"]>): ReturnType<FoodOrderViews["microCacheBypassed"]> {
    return this.views.microCacheBypassed(...args);
  }

  signCached(...args: Parameters<FoodOrderViews["signCached"]>): ReturnType<FoodOrderViews["signCached"]> {
    return this.views.signCached(...args);
  }

  signProofPhoto(...args: Parameters<FoodOrderViews["signProofPhoto"]>): ReturnType<FoodOrderViews["signProofPhoto"]> {
    return this.views.signProofPhoto(...args);
  }

  signSwapPhoto(...args: Parameters<FoodOrderViews["signSwapPhoto"]>): ReturnType<FoodOrderViews["signSwapPhoto"]> {
    return this.views.signSwapPhoto(...args);
  }

  /** C5 kitchen socket queue: best-effort push telling the merchant's tablet(s) something on their
   *  queue changed, so a connected tablet doesn't wait out E2's 5s poll fallback. `merchantId` is
   *  nullable only defensively — every real merchant order carries one — so a miss is a silent no-op,
   *  never load-bearing for the mutation that already committed. */
  notifyQueue(merchantId: string | null | undefined, orderId: string): void {
    notifyFoodQueueChanged(this.gateway, merchantId, orderId);
    void this.emitTrack(orderId);
  }

  /** Order flow v2 (BRIEF §4, D-59): every kitchen-side change also reaches the customer's order room as
   *  `order:status` carrying the phase and the derived four-step track (an installed app just refetches
   *  on it). Best-effort and post-commit: a failed read or emit never touches the mutation. */
  private async emitTrack(orderId: string): Promise<void> {
    try {
      const o = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, merchantPhase: true, autoAccepted: true, kitchenConfirmedAt: true },
      });
      if (!o) return;
      this.gateway.emitOrderStatus(orderId, o.status, { merchantPhase: o.merchantPhase, track: deriveMerchantOrderTrack(o) });
    } catch (err) {
      this.logger.debug?.(`track emit skipped for order ${orderId}: ${(err as Error).message}`);
    }
  }

  onModuleInit(): void {
    // DB-only reconciler (no BullMQ per-order scheduling, unlike order-lifecycle.service's rating
    // auto-close) — a tight sweep interval (RESTAURANTS_TIMING.sweepIntervalMs, 20s) keeps the
    // customer-side windows (item approval, substitutions) and the D1 "still waiting" pushes on time
    // without the added queue/worker infra.
    void this.runSweeps();
    this.sweep = setInterval(() => void this.runSweeps(), RESTAURANTS_TIMING.sweepIntervalMs);
    this.sweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  private runSweeps(...args: Parameters<FoodOrderLifecycle["runSweeps"]>): ReturnType<FoodOrderLifecycle["runSweeps"]> {
    return this.lifecycle.runSweeps(...args);
  }

  placeOrder(...args: Parameters<FoodOrderPlacing["placeOrder"]>): ReturnType<FoodOrderPlacing["placeOrder"]> {
    return this.placing.placeOrder(...args);
  }

  findByIdempotencyKey(...args: Parameters<FoodOrderPlacing["findByIdempotencyKey"]>): ReturnType<FoodOrderPlacing["findByIdempotencyKey"]> {
    return this.placing.findByIdempotencyKey(...args);
  }

  getMyOrder(...args: Parameters<FoodOrderViews["getMyOrder"]>): ReturnType<FoodOrderViews["getMyOrder"]> {
    return this.views.getMyOrder(...args);
  }

  withDetail(...args: Parameters<FoodOrderViews["withDetail"]>): ReturnType<FoodOrderViews["withDetail"]> {
    return this.views.withDetail(...args);
  }

  approveItems(...args: Parameters<FoodOrderPlacing["approveItems"]>): ReturnType<FoodOrderPlacing["approveItems"]> {
    return this.placing.approveItems(...args);
  }

  cancelUnpaid(...args: Parameters<FoodOrderPlacing["cancelUnpaid"]>): ReturnType<FoodOrderPlacing["cancelUnpaid"]> {
    return this.placing.cancelUnpaid(...args);
  }

  submitPaymentReference(...args: Parameters<FoodOrderPlacing["submitPaymentReference"]>): ReturnType<FoodOrderPlacing["submitPaymentReference"]> {
    return this.placing.submitPaymentReference(...args);
  }

  sendPaymentPrompt(...args: Parameters<FoodOrderPlacing["sendPaymentPrompt"]>): ReturnType<FoodOrderPlacing["sendPaymentPrompt"]> {
    return this.placing.sendPaymentPrompt(...args);
  }

  checkPaymentPrompt(...args: Parameters<FoodOrderPlacing["checkPaymentPrompt"]>): ReturnType<FoodOrderPlacing["checkPaymentPrompt"]> {
    return this.placing.checkPaymentPrompt(...args);
  }

  listQueue(...args: Parameters<FoodOrderLifecycle["listQueue"]>): ReturnType<FoodOrderLifecycle["listQueue"]> {
    return this.lifecycle.listQueue(...args);
  }

  getQueueOrder(...args: Parameters<FoodOrderLifecycle["getQueueOrder"]>): ReturnType<FoodOrderLifecycle["getQueueOrder"]> {
    return this.lifecycle.getQueueOrder(...args);
  }

  confirmKitchenAsMerchant(...args: Parameters<FoodOrderLifecycle["confirmKitchenAsMerchant"]>): ReturnType<FoodOrderLifecycle["confirmKitchenAsMerchant"]> {
    return this.lifecycle.confirmKitchenAsMerchant(...args);
  }

  editItems(...args: Parameters<FoodOrderLifecycle["editItems"]>): ReturnType<FoodOrderLifecycle["editItems"]> {
    return this.lifecycle.editItems(...args);
  }

  closeOrder(...args: Parameters<FoodOrderLifecycle["closeOrder"]>): ReturnType<FoodOrderLifecycle["closeOrder"]> {
    return this.lifecycle.closeOrder(...args);
  }

  getAsRider(...args: Parameters<FoodOrderLifecycle["getAsRider"]>): ReturnType<FoodOrderLifecycle["getAsRider"]> {
    return this.lifecycle.getAsRider(...args);
  }

  acceptOrder(...args: Parameters<FoodOrderLifecycle["acceptOrder"]>): ReturnType<FoodOrderLifecycle["acceptOrder"]> {
    return this.lifecycle.acceptOrder(...args);
  }

  rejectOrder(...args: Parameters<FoodOrderLifecycle["rejectOrder"]>): ReturnType<FoodOrderLifecycle["rejectOrder"]> {
    return this.lifecycle.rejectOrder(...args);
  }

  cancelPreparing(...args: Parameters<FoodOrderLifecycle["cancelPreparing"]>): ReturnType<FoodOrderLifecycle["cancelPreparing"]> {
    return this.lifecycle.cancelPreparing(...args);
  }

  closeOpenOffers(...args: Parameters<FoodOrderLifecycle["closeOpenOffers"]>): ReturnType<FoodOrderLifecycle["closeOpenOffers"]> {
    return this.lifecycle.closeOpenOffers(...args);
  }

  logCall(...args: Parameters<FoodOrderLifecycle["logCall"]>): ReturnType<FoodOrderLifecycle["logCall"]> {
    return this.lifecycle.logCall(...args);
  }

  requestPayment(...args: Parameters<FoodOrderLifecycle["requestPayment"]>): ReturnType<FoodOrderLifecycle["requestPayment"]> {
    return this.lifecycle.requestPayment(...args);
  }

  confirmPayment(...args: Parameters<FoodOrderLifecycle["confirmPayment"]>): ReturnType<FoodOrderLifecycle["confirmPayment"]> {
    return this.lifecycle.confirmPayment(...args);
  }

  releaseUnpaid(...args: Parameters<FoodOrderLifecycle["releaseUnpaid"]>): ReturnType<FoodOrderLifecycle["releaseUnpaid"]> {
    return this.lifecycle.releaseUnpaid(...args);
  }

  markReady(...args: Parameters<FoodOrderLifecycle["markReady"]>): ReturnType<FoodOrderLifecycle["markReady"]> {
    return this.lifecycle.markReady(...args);
  }

  extendPrep(...args: Parameters<FoodOrderLifecycle["extendPrep"]>): ReturnType<FoodOrderLifecycle["extendPrep"]> {
    return this.lifecycle.extendPrep(...args);
  }

  revealPickupCode(...args: Parameters<FoodOrderLifecycle["revealPickupCode"]>): ReturnType<FoodOrderLifecycle["revealPickupCode"]> {
    return this.lifecycle.revealPickupCode(...args);
  }

  mintPickupCode(...args: Parameters<FoodOrderLifecycle["mintPickupCode"]>): ReturnType<FoodOrderLifecycle["mintPickupCode"]> {
    return this.lifecycle.mintPickupCode(...args);
  }

  confirmPickup(...args: Parameters<FoodOrderLifecycle["confirmPickup"]>): ReturnType<FoodOrderLifecycle["confirmPickup"]> {
    return this.lifecycle.confirmPickup(...args);
  }

  handoverSig(...args: Parameters<FoodOrderLifecycle["handoverSig"]>): ReturnType<FoodOrderLifecycle["handoverSig"]> {
    return this.lifecycle.handoverSig(...args);
  }

  createHandoverLink(...args: Parameters<FoodOrderLifecycle["createHandoverLink"]>): ReturnType<FoodOrderLifecycle["createHandoverLink"]> {
    return this.lifecycle.createHandoverLink(...args);
  }

  verifyHandoverLink(...args: Parameters<FoodOrderLifecycle["verifyHandoverLink"]>): ReturnType<FoodOrderLifecycle["verifyHandoverLink"]> {
    return this.lifecycle.verifyHandoverLink(...args);
  }

  handoverLinkInfo(...args: Parameters<FoodOrderLifecycle["handoverLinkInfo"]>): ReturnType<FoodOrderLifecycle["handoverLinkInfo"]> {
    return this.lifecycle.handoverLinkInfo(...args);
  }

  confirmHandoverLink(...args: Parameters<FoodOrderLifecycle["confirmHandoverLink"]>): ReturnType<FoodOrderLifecycle["confirmHandoverLink"]> {
    return this.lifecycle.confirmHandoverLink(...args);
  }

  confirmCollected(...args: Parameters<FoodOrderLifecycle["confirmCollected"]>): ReturnType<FoodOrderLifecycle["confirmCollected"]> {
    return this.lifecycle.confirmCollected(...args);
  }

  commitPickup(...args: Parameters<FoodOrderLifecycle["commitPickup"]>): ReturnType<FoodOrderLifecycle["commitPickup"]> {
    return this.lifecycle.commitPickup(...args);
  }

  sweepExpiredAcceptWindows(...args: Parameters<FoodOrderLifecycle["sweepExpiredAcceptWindows"]>): ReturnType<FoodOrderLifecycle["sweepExpiredAcceptWindows"]> {
    return this.lifecycle.sweepExpiredAcceptWindows(...args);
  }

  sweepStillWaiting(...args: Parameters<FoodOrderLifecycle["sweepStillWaiting"]>): ReturnType<FoodOrderLifecycle["sweepStillWaiting"]> {
    return this.lifecycle.sweepStillWaiting(...args);
  }

  sweepExpiredItemApprovals(...args: Parameters<FoodOrderLifecycle["sweepExpiredItemApprovals"]>): ReturnType<FoodOrderLifecycle["sweepExpiredItemApprovals"]> {
    return this.lifecycle.sweepExpiredItemApprovals(...args);
  }

  sweepExpiredPhase(...args: Parameters<FoodOrderLifecycle["sweepExpiredPhase"]>): ReturnType<FoodOrderLifecycle["sweepExpiredPhase"]> {
    return this.lifecycle.sweepExpiredPhase(...args);
  }

  commitStaleCancellation(...args: Parameters<FoodOrderLifecycle["commitStaleCancellation"]>): ReturnType<FoodOrderLifecycle["commitStaleCancellation"]> {
    return this.lifecycle.commitStaleCancellation(...args);
  }

  sweepEndOfDayClose(...args: Parameters<FoodOrderLifecycle["sweepEndOfDayClose"]>): ReturnType<FoodOrderLifecycle["sweepEndOfDayClose"]> {
    return this.lifecycle.sweepEndOfDayClose(...args);
  }

  sweepPaymentReminders(...args: Parameters<FoodOrderLifecycle["sweepPaymentReminders"]>): ReturnType<FoodOrderLifecycle["sweepPaymentReminders"]> {
    return this.lifecycle.sweepPaymentReminders(...args);
  }

  sweepAutoAccepted(...args: Parameters<FoodOrderLifecycle["sweepAutoAccepted"]>): ReturnType<FoodOrderLifecycle["sweepAutoAccepted"]> {
    return this.lifecycle.sweepAutoAccepted(...args);
  }

  // ── Order flow v2 (ledger D-59, backend B) ──────────────────────────────────────────────────────────

  scheduleService(): OrderScheduleService {
    if (!this.schedule) throw new ConflictException({ reason: "slot_unavailable", message: "Scheduled orders aren't available." });
    return this.schedule;
  }

  prescriptionService(): PrescriptionService {
    if (!this.prescriptions) throw new ConflictException({ reason: "rx_unavailable", message: "Prescription medicines can't be ordered in the app yet." });
    return this.prescriptions;
  }

  changeSchedule(...args: Parameters<FoodOrderPlacing["changeSchedule"]>): ReturnType<FoodOrderPlacing["changeSchedule"]> {
    return this.placing.changeSchedule(...args);
  }

  listScheduled(...args: Parameters<FoodOrderPlacing["listScheduled"]>): ReturnType<FoodOrderPlacing["listScheduled"]> {
    return this.placing.listScheduled(...args);
  }

  offerJobInfo(...args: Parameters<FoodOrderLifecycle["offerJobInfo"]>): ReturnType<FoodOrderLifecycle["offerJobInfo"]> {
    return this.lifecycle.offerJobInfo(...args);
  }

  myBalance(...args: Parameters<FoodOrderViews["myBalance"]>): ReturnType<FoodOrderViews["myBalance"]> {
    return this.views.myBalance(...args);
  }

  ownMerchantId(...args: Parameters<FoodOrderViews["ownMerchantId"]>): ReturnType<FoodOrderViews["ownMerchantId"]> {
    return this.views.ownMerchantId(...args);
  }

  findOwnAsMerchant(...args: Parameters<FoodOrderViews["findOwnAsMerchant"]>): ReturnType<FoodOrderViews["findOwnAsMerchant"]> {
    return this.views.findOwnAsMerchant(...args);
  }

  findOwnAsCustomer(...args: Parameters<FoodOrderViews["findOwnAsCustomer"]>): ReturnType<FoodOrderViews["findOwnAsCustomer"]> {
    return this.views.findOwnAsCustomer(...args);
  }

  mustFindWithItems(...args: Parameters<FoodOrderViews["mustFindWithItems"]>): ReturnType<FoodOrderViews["mustFindWithItems"]> {
    return this.views.mustFindWithItems(...args);
  }

  forMerchant(...args: Parameters<FoodOrderViews["forMerchant"]>): ReturnType<FoodOrderViews["forMerchant"]> {
    return this.views.forMerchant(...args);
  }

  notifyCancelledCustomer(...args: Parameters<FoodOrderViews["notifyCancelledCustomer"]>): ReturnType<FoodOrderViews["notifyCancelledCustomer"]> {
    return this.views.notifyCancelledCustomer(...args);
  }

  notifyPaymentRequested(...args: Parameters<FoodOrderViews["notifyPaymentRequested"]>): ReturnType<FoodOrderViews["notifyPaymentRequested"]> {
    return this.views.notifyPaymentRequested(...args);
  }

  toResponse(...args: Parameters<FoodOrderViews["toResponse"]>): ReturnType<FoodOrderViews["toResponse"]> {
    return this.views.toResponse(...args);
  }
}
