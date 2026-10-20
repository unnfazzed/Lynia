/**
 * What FoodOrderService's parts reach on the service (R-6, QA 2026-10-20). The parts are typed against this
 * interface instead of the service class so they don't import it back (no import cycle); the service passes
 * itself, and TypeScript checks it satisfies this.
 */
import type { Logger } from "@nestjs/common";
import type { PaymentRail } from "../adapters/payments/payment-rail.interface";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import type { TokenService } from "../auth/token.service";
import type { PiiCryptoService } from "../common/pii-crypto.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { FoodDebtService } from "./food-debt.service";
import type { MicroCache } from "../common/micro-cache";
import type { OrderSubstitutionService } from "./order-substitution.service";
import type { Env } from "../config/env";
import type { OrderScheduleService } from "./order-schedule.service";
import type { PrescriptionService } from "./prescription.service";
import type { OwnerAlertsService } from "../owner-alerts/owner-alerts.service";
import type { OrderStatus, Prisma } from "@prisma/client";
import type { MerchantOrderResponse } from "@lynia/shared";
import type { OrderWithItems, StampedRejectionReason } from "./food-order.helpers";

export interface FoodOrderHost {
  closeOpenOffers(orderId: string): Promise<void>;
  readonly codeCrypto?: PiiCryptoService;
  commitPickup(tx: Prisma.TransactionClient, orderId: string, riderId: string, o: {
      merchant_id: string | null;
      merchant_payment_method: string | null;
      merchant_cash_rule: string | null;
      merchant_goods_total: Prisma.Decimal | null;
      delivery_fee?: Prisma.Decimal | null;
      merchant_delivery_share?: Prisma.Decimal | null;
    }): Promise<void>;
  commitStaleCancellation(orderId: string, merchantId: string | null | undefined, whereExtra: Prisma.OrderWhereInput, reason: StampedRejectionReason, stage?: string | null): Promise<boolean>;
  confirmPickup(orderId: string, riderId: string, code: string): Promise<{ orderId: string; status: "picked_up" }>;
  readonly debt: FoodDebtService;
  readonly env?: Env;
  findByIdempotencyKey(customerId: string, idempotencyKey: string | undefined): Promise<OrderWithItems | null>;
  findOwnAsCustomer(orderId: string, customerId: string): Promise<OrderWithItems>;
  findOwnAsMerchant(profileId: string, orderId: string): Promise<OrderWithItems>;
  forMerchant(order: OrderWithItems): MerchantOrderResponse;
  readonly gateway: TrackingGateway;
  handoverSig(orderId: string, riderId: string, exp: number, pickupCodeHash: string): string;
  readonly logger: Logger;
  microCacheBypassed(ttlMs: number): boolean;
  mintPickupCode(orderId: string, where: Prisma.OrderWhereInput, replacesHash: string | null, lockoutReissues: number | null): Promise<string | null>;
  mustFindWithItems(orderId: string): Promise<OrderWithItems>;
  readonly notifications: NotificationsService;
  notifyCancelledCustomer(orderId: string, reason: StampedRejectionReason, note?: string | null): Promise<void>;
  notifyPaymentRequested(orderId: string, customerId: string, title: string, body: string): Promise<void>;
  notifyQueue(merchantId: string | null | undefined, orderId: string): void;
  ownMerchantId(profileId: string): Promise<string>;
  readonly ownerAlerts?: OwnerAlertsService;
  readonly paymentRail: PaymentRail;
  prescriptionService(): PrescriptionService;
  readonly prisma: PrismaService;
  readonly proofPhotoUrlCache: MicroCache<string>;
  scheduleService(): OrderScheduleService;
  signCached(cache: MicroCache<string>, key: string, signedTtlSeconds: number, cacheTtlMs: number): Promise<string>;
  signProofPhoto(key: string): Promise<string | null>;
  signSwapPhoto(key: string): Promise<string | null>;
  readonly storage?: StorageAdapter;
  readonly substitutions?: OrderSubstitutionService;
  readonly swapPhotoUrlCache: MicroCache<string>;
  sweepAutoAccepted(now?: Date): Promise<{ escalated: number; released: number; cancelled: number }>;
  sweepEndOfDayClose(): Promise<{ cancelled: number }>;
  sweepExpiredAcceptWindows(now?: Date): Promise<{ cancelled: number }>;
  sweepExpiredItemApprovals(): Promise<{ cancelled: number }>;
  sweepExpiredPhase(phase: "awaiting_accept" | "awaiting_item_approval", deadlineField: "acceptDeadlineAt" | "itemApprovalDeadlineAt", reason: StampedRejectionReason): Promise<{ cancelled: number }>;
  sweepPaymentReminders(): Promise<{ reminded: number }>;
  sweepStillWaiting(now?: Date): Promise<{ pushed: number }>;
  toResponse(order: OrderWithItems): MerchantOrderResponse;
  readonly tokens: TokenService;
  verifyHandoverLink(token: string, now: Date): Promise<{ order: { id: string; riderId: string | null; status: OrderStatus; pickupCodeHash: string | null; merchant: { name: string } | null } & { riderId: string }; exp: number }>;
  withDetail(order: OrderWithItems, response: MerchantOrderResponse): Promise<MerchantOrderResponse>;
}
