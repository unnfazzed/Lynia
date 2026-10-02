import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  addMoney,
  BUSY_MODE_EXTRA_MIN,
  type ConfirmSubstitutionRequest,
  deriveMerchantOrderTrack,
  foodOrderMoney,
  fromCents,
  recomputeMerchantDeliveryShare,
  merchantGoodsForSubtotal,
  type ProposeSubstitutionRequest,
  RESTAURANTS_TIMING,
  toCents,
} from "@lynia/shared";
import { pushCopy, PUSH_C } from "../notifications/merchant-order-push";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { isDishOutOfStock, notifyFoodQueueChanged, resolveOwnMerchantId } from "./merchant-lookup.util";

/**
 * Order flow v2 substitution (BRIEF §8, handoff U1–U5 / M2, ledger D-59).
 *
 * The venue proposes per line: remove it, drop the quantity, or swap it for another item of its own
 * catalogue. Removals and quantity drops apply at once and are announced (nothing to answer). Any swap
 * needs the customer's yes, within {@link RESTAURANTS_TIMING.substitutionWindowMs}; no answer by then
 * means every swap is declined, those lines are removed and the order carries on. If nothing is left the
 * order is cancelled and nothing is charged (U5). The customer can always cancel the whole order free
 * while a round is open (the existing customer cancel route).
 *
 * State, so every reader sees something coherent at every moment:
 *  - The swapped line is taken off (`available: false`) the moment the swap is proposed, and the order's
 *    totals are the "every swap declined" outcome — the no-answer default. An accepted swap ADDS a line
 *    (`replacesItemId` → the line it replaced) and the totals go up on confirm.
 *  - At accept on a manual-accept venue (`awaiting_accept`), a round with a swap parks the order in the
 *    legacy `awaiting_item_approval` phase with `itemApprovalDeadlineAt` = the round's deadline. An
 *    installed (pre-v2) customer app understands exactly that state: it shows the shortened order (the
 *    swapped lines as removed) and answers through `items-response` — approve resolves the round with
 *    the swaps declined (the old app never saw them), decline cancels free. See {@link handleLegacyApproval}.
 *  - Mid-prep ("Change items"), the phase stays `preparing`: cooking goes on (M2 "Start making the rest").
 *  - While a round is open the order can't be marked ready (FoodOrderService.markReady and the
 *    auto-accept release check {@link hasOpenRound}), so the rider never collects an unanswered order.
 *
 * Persistence: `merchant_order_substitutions` (one row per round, at most one `open` per order — a
 * partial unique index) + `merchant_order_substitution_lines`. The reconciler sweep times rounds out on
 * the same DB-only 20 s cadence as the other food sweeps.
 */

/** Statuses at which a round can still be answered: before the rider has the food. */
const PRE_PICKUP_STATUSES: ReadonlySet<string> = new Set(["requested", "open_for_offers", "assigned", "confirmed", "en_route_pickup"]);

const ROUND_INCLUDE = { lines: { orderBy: { createdAt: "asc" } } } satisfies Prisma.MerchantOrderSubstitutionInclude;
type RoundWithLines = Prisma.MerchantOrderSubstitutionGetPayload<{ include: typeof ROUND_INCLUDE }>;

const ORDER_INCLUDE = {
  merchantItems: { orderBy: { createdAt: "asc" } },
  merchant: { select: { name: true, busyMode: true } },
} satisfies Prisma.OrderInclude;
type OrderForSubstitution = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function names(list: readonly string[]): string {
  return list.join(", ");
}

/** What a resolution did, for the post-commit notices. */
interface ResolutionOutcome {
  orderId: string;
  merchantId: string | null;
  customerId: string;
  venue: string;
  cancelled: boolean;
  total: number;
  status: string;
  merchantPhase: string | null;
  removedNames: string[];
  /** An auto-accepted order the kitchen hasn't confirmed (the track's step 1 is still in progress). */
  kitchenUnconfirmed: boolean;
}

@Injectable()
export class OrderSubstitutionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderSubstitutionService.name);
  private sweep?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
  ) {}

  onModuleInit(): void {
    this.sweep = setInterval(() => void this.runSweep(), RESTAURANTS_TIMING.sweepIntervalMs);
    this.sweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  private async runSweep(): Promise<void> {
    try {
      await this.sweepExpiredRounds();
    } catch (err) {
      this.logger.error(`sweepExpiredRounds failed: ${(err as Error).message}`);
    }
  }

  // ── Reads used by FoodOrderService ──────────────────────────────────────────────────────────────

  async hasOpenRound(orderId: string): Promise<boolean> {
    const n = await this.prisma.merchantOrderSubstitution.count({ where: { orderId, status: "open" } });
    return n > 0;
  }

  /** The merchant can't mark an order ready (or have it auto-released) while the customer is answering. */
  async assertNoOpenRound(orderId: string): Promise<void> {
    if (await this.hasOpenRound(orderId)) {
      throw new ConflictException({
        reason: "substitution_open",
        message: "Waiting for the customer to answer your changes — up to 3 minutes.",
      });
    }
  }

  /** The customer cancelled the order while a round was open: close it. Best-effort bookkeeping — the
   *  sweep also closes a round whose order has ended. */
  async closeRoundsForCancelledOrder(orderId: string): Promise<void> {
    await this.prisma.merchantOrderSubstitution.updateMany({
      where: { orderId, status: "open" },
      data: { status: "cancelled", resolvedAt: new Date() },
    });
  }

  // ── Merchant: propose (U1a at accept, U4a "Change items") ───────────────────────────────────────

  async propose(profileId: string, orderId: string, body: ProposeSubstitutionRequest): Promise<void> {
    const merchantId = await resolveOwnMerchantId(this.prisma, profileId);
    const now = new Date();

    const result = await this.inTx(async (tx) => {
      await this.lockOrder(tx, orderId);
      const order = await tx.order.findFirst({ where: { id: orderId, merchantId, orderType: "merchant" }, include: ORDER_INCLUDE });
      if (!order) throw new NotFoundException("Order not found");
      if (order.status !== "requested" || (order.merchantPhase !== "awaiting_accept" && order.merchantPhase !== "preparing")) {
        throw new ConflictException({
          reason: "not_changeable",
          message: "You can change items when the order comes in or while you're making it.",
        });
      }
      const atAccept = order.merchantPhase === "awaiting_accept";
      if (atAccept && body.prepMinutes === undefined) {
        throw new BadRequestException("Choose a prep time to accept the order");
      }
      const open = await tx.merchantOrderSubstitution.count({ where: { orderId, status: "open" } });
      if (open > 0) {
        throw new ConflictException({ reason: "substitution_open", message: "The customer is still answering your last changes." });
      }

      // ── Validate the lines ──
      const itemById = new Map(order.merchantItems.map((it) => [it.id, it]));
      const seen = new Set<string>();
      for (const line of body.lines) {
        if (seen.has(line.itemId)) throw new BadRequestException("Each item can only be changed once per round");
        seen.add(line.itemId);
        const item = itemById.get(line.itemId);
        if (!item) throw new NotFoundException("One or more lines are not on this order");
        if (item.available === false) throw new ConflictException({ reason: "line_removed", message: `${item.nameSnapshot} is already off this order` });
        if (line.action === "reduce" && line.quantity >= item.quantity) {
          throw new BadRequestException(`The new quantity for ${item.nameSnapshot} must be lower than ${item.quantity}`);
        }
      }
      const swapLines = body.lines.filter((l): l is Extract<typeof l, { action: "swap" }> => l.action === "swap");
      if (swapLines.length > 0 && order.outOfStockPref === "remove") {
        throw new ConflictException({
          reason: "swaps_off",
          message: "This customer asked for missing items to be removed, not swapped.",
        });
      }
      const dishIds = [...new Set(swapLines.map((l) => l.dishId))];
      const dishes = dishIds.length
        ? await tx.merchantDish.findMany({ where: { id: { in: dishIds }, merchantId } })
        : [];
      const dishById = new Map(dishes.map((d) => [d.id, d]));
      for (const l of swapLines) {
        const dish = dishById.get(l.dishId);
        if (!dish) throw new NotFoundException("The swap isn't one of your items");
        if (dish.isDraft) throw new ConflictException(`${dish.name} isn't on your menu yet`);
        if (isDishOutOfStock(dish)) throw new ConflictException(`${dish.name} is out of stock too`);
        if (dish.id === itemById.get(l.itemId)!.dishId) throw new BadRequestException("Swap for a different item");
      }

      // ── The new state ──
      const proposalByItem = new Map(body.lines.map((l) => [l.itemId, l]));
      let keptCents = 0;
      let keptLines = 0;
      for (const it of order.merchantItems) {
        if (it.available === false) continue;
        const p = proposalByItem.get(it.id);
        if (!p) {
          keptCents += toCents(Number(it.priceUsd)) * it.quantity;
          keptLines++;
        } else if (p.action === "reduce") {
          keptCents += toCents(Number(it.priceUsd)) * p.quantity;
          keptLines++;
        }
      }
      const keptSubtotal = fromCents(keptCents);
      // Nothing kept while swaps are pending: the no-answer outcome is a cancel (nothing charged), so the
      // stored total is the delivery fee alone rather than a lone small-order fee on an empty basket.
      const goods = keptLines === 0 ? { itemsSubtotal: 0, smallOrderFee: 0, goodsTotal: 0 } : merchantGoodsForSubtotal(keptSubtotal);
      const deliveryFee = Number(order.deliveryFee ?? 0);
      // D-71: totals are the customer's — a free-delivery venue's share comes off, capped by the goods.
      const wasTotal = foodOrderMoney({ goodsTotal: order.merchantGoodsTotal, deliveryFee, merchantDeliveryShare: order.merchantDeliveryShare }).customerTotal;
      const merchantDeliveryShare = recomputeMerchantDeliveryShare(order.merchantDeliveryShare, goods.goodsTotal, deliveryFee);
      const newTotal = foodOrderMoney({ goodsTotal: goods.goodsTotal, deliveryFee, merchantDeliveryShare }).customerTotal;
      const hasSwaps = swapLines.length > 0;
      const allGone = !hasSwaps && keptLines === 0;
      const deadlineAt = hasSwaps ? new Date(now.getTime() + RESTAURANTS_TIMING.substitutionWindowMs) : null;

      const round = await tx.merchantOrderSubstitution.create({
        data: {
          orderId,
          kind: atAccept || (order.autoAccepted && !order.kitchenConfirmedAt) ? "at_accept" : "mid_prep",
          status: hasSwaps ? "open" : "applied",
          deadlineAt,
          wasTotal,
          createdByProfileId: profileId,
          resolvedAt: hasSwaps ? null : now,
          lines: {
            create: body.lines.map((l) => {
              const item = itemById.get(l.itemId)!;
              const dish = l.action === "swap" ? dishById.get(l.dishId)! : null;
              return {
                orderItemId: item.id,
                action: l.action,
                nameSnapshot: item.nameSnapshot,
                priceUsd: item.priceUsd,
                fromQuantity: item.quantity,
                toQuantity: l.action === "reduce" ? l.quantity : l.action === "remove" ? 0 : null,
                swapDishId: dish?.id ?? null,
                swapNameSnapshot: dish?.name ?? null,
                swapPriceUsd: dish?.priceUsd ?? null,
                swapQuantity: l.action === "swap" ? (l.quantity ?? item.quantity) : null,
              };
            }),
          },
        },
      });

      // Lines: removed/swapped lines come off now; quantity drops apply now; at accept every untouched
      // line is confirmed kept (the D-23 item-level accept shape the legacy app reads).
      for (const l of body.lines) {
        if (l.action === "reduce") {
          await tx.merchantOrderItem.update({ where: { id: l.itemId }, data: { quantity: l.quantity, available: true } });
        } else {
          await tx.merchantOrderItem.update({ where: { id: l.itemId }, data: { available: false } });
        }
      }
      if (atAccept) {
        await tx.merchantOrderItem.updateMany({
          where: { orderId, id: { notIn: [...proposalByItem.keys()] }, available: null },
          data: { available: true },
        });
      }

      // Order: totals, and the phase the proposal moves it to.
      const cash = order.merchantPaymentMethod === "cash";
      const prepMinutes = body.prepMinutes !== undefined ? body.prepMinutes + (order.merchant?.busyMode ? BUSY_MODE_EXTRA_MIN : 0) : undefined;
      let data: Prisma.OrderUpdateManyMutationInput = {
        merchantGoodsTotal: goods.goodsTotal,
        merchantDeliveryShare,
        agreedFare: newTotal,
        itemsEditedAt: now,
      };
      if (allGone) {
        data = { status: "cancelled", cancelledAt: now, rejectionReason: "all_out_of_stock", merchantPhase: null, itemsEditedAt: now };
      } else if (atAccept) {
        data = hasSwaps
          ? { ...data, merchantPhase: "awaiting_item_approval", itemApprovalDeadlineAt: deadlineAt, prepMinutes }
          : cash
            ? { ...data, merchantPhase: "preparing", prepMinutes, prepStartedAt: now }
            : { ...data, merchantPhase: "awaiting_payment", prepMinutes };
      } else if (order.autoAccepted && !order.kitchenConfirmedAt) {
        // Sending changes from the ringing sheet plainly confirms the kitchen knows about the order
        // (same rule as markReady).
        data = { ...data, kitchenConfirmedAt: now, kitchenConfirmedBy: "merchant" };
      }
      const claimed = await tx.order.updateMany({ where: { id: orderId, status: "requested", merchantPhase: order.merchantPhase }, data });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      if (allGone) await tx.orderEvent.create({ data: { orderId, status: "cancelled" } });

      return {
        order,
        roundId: round.id,
        hasSwaps,
        allGone,
        atAccept,
        total: newTotal,
        status: allGone ? "cancelled" : "requested",
        merchantPhase: allGone ? null : ((data.merchantPhase as string | undefined) ?? order.merchantPhase),
        removedNames: body.lines
          .filter((l) => l.action !== "swap")
          .map((l) => itemById.get(l.itemId)!.nameSnapshot),
        swaps: swapLines.map((l) => ({
          from: itemById.get(l.itemId)!.nameSnapshot,
          to: dishById.get(l.dishId)!.name,
          diff: addMoney(Number(dishById.get(l.dishId)!.priceUsd), -Number(itemById.get(l.itemId)!.priceUsd)),
        })),
      };
    });

    // ── After commit: tell the customer, move the screens ──
    const venue = result.order.merchant?.name ?? "The restaurant";
    const data = { orderId, status: result.status, to: "customer", orderType: "merchant", kind: "food_substitution" };
    if (result.allGone) {
      await this.notifications.notifyProfiles([result.order.customerId], {
        title: `${venue} couldn’t supply anything in your order`,
        body: "They’re out of every item. Your order is cancelled and nothing was charged.",
        data: { ...data, kind: "food_substitution_cancelled" },
      });
    } else if (result.hasSwaps) {
      const first = result.swaps[0]!;
      const diff = first.diff === 0 ? "same price" : `${first.diff > 0 ? "+" : "−"}${money(Math.abs(first.diff))}`;
      // Order flow v2 G3a (O.g.push.c[2]): "{v} needs your answer" / "{i} is out. Swap for {s} ({d})? Answer in 3 min."
      const drawn = pushCopy(PUSH_C.answer, { v: venue, i: first.from, s: first.to, d: diff });
      await this.notifications.notifyProfiles([result.order.customerId], {
        title: result.atAccept ? drawn.title : `${venue} wants to change your order`,
        body: result.swaps.length === 1 ? drawn.body : `${result.swaps.length} swaps to answer. Answer in 3 min.`,
        data,
      });
    } else {
      await this.notifications.notifyProfiles([result.order.customerId], {
        title: `${venue} changed your order`,
        body: `${venue} took off ${names(result.removedNames)} — they ran out. New total ${money(result.total)}. Nothing to answer.`,
        data,
      });
    }
    // Sending changes confirmed an auto-accepted kitchen (above), so the kitchen is confirmed from here.
    this.announce(orderId, result.order.merchantId, result.status, result.merchantPhase, false);
  }

  // ── Customer: confirm (U2 "Confirm changes") ────────────────────────────────────────────────────

  async confirm(customerId: string, orderId: string, body: ConfirmSubstitutionRequest): Promise<void> {
    const outcome = await this.inTx(async (tx) => {
      await this.lockOrder(tx, orderId);
      const order = await tx.order.findFirst({ where: { id: orderId, customerId, orderType: "merchant" }, include: ORDER_INCLUDE });
      if (!order) throw new NotFoundException("Order not found");
      const round = await tx.merchantOrderSubstitution.findFirst({ where: { orderId, status: "open" }, include: ROUND_INCLUDE });
      if (!round || round.id !== body.roundId) {
        throw new ConflictException({ reason: "round_closed", message: "These changes were already settled." });
      }
      if (round.deadlineAt && round.deadlineAt.getTime() < Date.now()) {
        throw new ConflictException({ reason: "round_expired", message: "The time to answer ran out — the swaps were declined." });
      }
      if (!PRE_PICKUP_STATUSES.has(order.status)) {
        throw new ConflictException({ reason: "round_closed", message: "These changes were already settled." });
      }
      const swapIds = new Set(round.lines.filter((l) => l.action === "swap").map((l) => l.id));
      const accepted = new Set<string>();
      const answered = new Set<string>();
      for (const a of body.answers) {
        if (!swapIds.has(a.lineId)) throw new BadRequestException("One or more answers are not for a swap in these changes");
        answered.add(a.lineId);
        if (a.accept) accepted.add(a.lineId);
      }
      if (answered.size !== swapIds.size) throw new BadRequestException("Answer every swap before confirming");
      return this.resolve(tx, order, round, accepted, "confirmed");
    });
    await this.afterResolution(outcome, "confirmed");
  }

  /**
   * An installed (pre-v2) customer app answering an at-accept round through the legacy
   * `items-response` route. It drew the order as shortened (the swapped lines as removed), so: approve =
   * keep the order with every swap declined; decline = cancel it, free. Returns false when the order has
   * no open round (the caller then runs the legacy D-23 path unchanged).
   */
  async handleLegacyApproval(orderId: string, customerId: string, approve: boolean): Promise<boolean> {
    const open = await this.prisma.merchantOrderSubstitution.findFirst({ where: { orderId, status: "open" }, select: { id: true } });
    if (!open) return false;
    if (!approve) return false; // the legacy decline path cancels the order; the caller closes the round
    const outcome = await this.inTx(async (tx) => {
      await this.lockOrder(tx, orderId);
      const order = await tx.order.findFirst({ where: { id: orderId, customerId, orderType: "merchant" }, include: ORDER_INCLUDE });
      if (!order) throw new NotFoundException("Order not found");
      const round = await tx.merchantOrderSubstitution.findFirst({ where: { orderId, status: "open" }, include: ROUND_INCLUDE });
      if (!round) throw new ConflictException("Order changed, retry");
      return this.resolve(tx, order, round, new Set(), "confirmed");
    });
    await this.afterResolution(outcome, "confirmed");
    return true;
  }

  // ── Reconciler: no answer in time ⇒ swaps declined (U3) ─────────────────────────────────────────

  async sweepExpiredRounds(now: Date = new Date()): Promise<{ timedOut: number }> {
    let timedOut = 0;
    const due = await this.prisma.merchantOrderSubstitution.findMany({
      where: { status: "open", deadlineAt: { lt: now } },
      select: { id: true, orderId: true },
      take: 100,
    });
    for (const r of due) {
      try {
        const outcome = await this.inTx(async (tx) => {
          await this.lockOrder(tx, r.orderId);
          const round = await tx.merchantOrderSubstitution.findUnique({ where: { id: r.id }, include: ROUND_INCLUDE });
          if (!round || round.status !== "open") return null;
          const order = await tx.order.findUnique({ where: { id: r.orderId }, include: ORDER_INCLUDE });
          if (!order || !PRE_PICKUP_STATUSES.has(order.status)) {
            // The order ended (cancelled by someone) while the round was open: just close the round.
            await tx.merchantOrderSubstitution.update({
              where: { id: round.id },
              data: { status: order?.status === "cancelled" ? "cancelled" : "timed_out", resolvedAt: now },
            });
            return null;
          }
          return this.resolve(tx, order, round, new Set(), "timed_out");
        });
        if (outcome) {
          timedOut++;
          await this.afterResolution(outcome, "timed_out");
        }
      } catch (err) {
        this.logger.error(`sweepExpiredRounds failed for round ${r.id}: ${(err as Error).message}`);
      }
    }
    return { timedOut };
  }

  // ── Shared resolution ───────────────────────────────────────────────────────────────────────────

  /** Commit a round's answers inside the caller's transaction (order row locked): accepted swaps add
   *  their line, totals are recomputed from the lines, an at-accept round lets cooking start, and an
   *  order with nothing left is cancelled (U5). */
  private async resolve(
    tx: Prisma.TransactionClient,
    order: OrderForSubstitution,
    round: RoundWithLines,
    accepted: ReadonlySet<string>,
    status: "confirmed" | "timed_out",
  ): Promise<ResolutionOutcome> {
    const now = new Date();
    const removedNames: string[] = [];
    let addedCents = 0;
    for (const line of round.lines) {
      if (line.action !== "swap") continue;
      if (accepted.has(line.id)) {
        const qty = line.swapQuantity ?? line.fromQuantity;
        const created = await tx.merchantOrderItem.create({
          data: {
            orderId: order.id,
            dishId: line.swapDishId,
            nameSnapshot: line.swapNameSnapshot ?? line.nameSnapshot,
            priceUsd: line.swapPriceUsd ?? line.priceUsd,
            quantity: qty,
            available: true,
            replacesItemId: line.orderItemId,
          },
        });
        addedCents += toCents(Number(line.swapPriceUsd ?? line.priceUsd)) * qty;
        await tx.merchantOrderSubstitutionLine.update({ where: { id: line.id }, data: { answer: "accept", resultItemId: created.id } });
      } else {
        removedNames.push(line.nameSnapshot);
        await tx.merchantOrderSubstitutionLine.update({ where: { id: line.id }, data: { answer: "remove" } });
      }
    }

    const keptCents = order.merchantItems
      .filter((it) => it.available !== false)
      .reduce((cents, it) => cents + toCents(Number(it.priceUsd)) * it.quantity, 0);
    const itemsSubtotal = fromCents(keptCents + addedCents);
    const nothingLeft = keptCents + addedCents === 0;
    const goods = merchantGoodsForSubtotal(itemsSubtotal);
    const deliveryFee = Number(order.deliveryFee ?? 0);
    // D-71: a free-delivery order stays free once the swaps land (share back up to the fee if goods allow).
    const merchantDeliveryShare = recomputeMerchantDeliveryShare(order.merchantDeliveryShare, goods.goodsTotal, deliveryFee);
    const newTotal = foodOrderMoney({ goodsTotal: goods.goodsTotal, deliveryFee, merchantDeliveryShare }).customerTotal;

    let data: Prisma.OrderUpdateManyMutationInput;
    let nextPhase = order.merchantPhase as string | null;
    if (nothingLeft && order.status === "requested") {
      data = { status: "cancelled", cancelledAt: now, rejectionReason: "all_out_of_stock", merchantPhase: null, itemApprovalDeadlineAt: null };
      nextPhase = null;
    } else {
      data = { merchantGoodsTotal: goods.goodsTotal, merchantDeliveryShare, agreedFare: newTotal, itemsEditedAt: now };
      if (order.merchantPhase === "awaiting_item_approval") {
        nextPhase = order.merchantPaymentMethod === "cash" ? "preparing" : "awaiting_payment";
        data = {
          ...data,
          merchantPhase: nextPhase as "preparing" | "awaiting_payment",
          itemApprovalDeadlineAt: null,
          ...(nextPhase === "preparing" ? { prepStartedAt: now } : {}),
        };
      }
    }
    const claimed = await tx.order.updateMany({ where: { id: order.id, status: order.status, merchantPhase: order.merchantPhase }, data });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    const cancelled = nothingLeft && order.status === "requested";
    if (cancelled) await tx.orderEvent.create({ data: { orderId: order.id, status: "cancelled" } });
    await tx.merchantOrderSubstitution.update({ where: { id: round.id }, data: { status, resolvedAt: now } });

    return {
      orderId: order.id,
      merchantId: order.merchantId,
      customerId: order.customerId,
      venue: order.merchant?.name ?? "The restaurant",
      cancelled,
      total: newTotal,
      status: cancelled ? "cancelled" : order.status,
      merchantPhase: nextPhase,
      removedNames,
      kitchenUnconfirmed: order.autoAccepted && !order.kitchenConfirmedAt,
    };
  }

  private async afterResolution(o: ResolutionOutcome, how: "confirmed" | "timed_out"): Promise<void> {
    const data = { orderId: o.orderId, status: o.status, to: "customer", orderType: "merchant", kind: "food_substitution" };
    if (o.cancelled) {
      await this.notifications.notifyProfiles([o.customerId], {
        title: `${o.venue} couldn’t supply anything in your order`,
        body: "They’re out of every item. Your order is cancelled and nothing was charged.",
        data: { ...data, kind: "food_substitution_cancelled" },
      });
    } else if (how === "timed_out") {
      await this.notifications.notifyProfiles([o.customerId], {
        title: `${o.venue} changed your order`,
        body: `No answer in time. ${names(o.removedNames)} taken off — your order carries on. New total ${money(o.total)}.`,
        data,
      });
    }
    this.announce(o.orderId, o.merchantId, o.status, o.merchantPhase, o.kitchenUnconfirmed);
  }

  /** Move every open screen: the merchant's queue and the customer's order room (with the track). */
  private announce(
    orderId: string,
    merchantId: string | null,
    status: string,
    merchantPhase: string | null,
    kitchenUnconfirmed: boolean,
  ): void {
    notifyFoodQueueChanged(this.gateway, merchantId, orderId);
    try {
      this.gateway.emitOrderStatus(orderId, status, {
        merchantPhase,
        track: deriveMerchantOrderTrack({
          status,
          merchantPhase,
          autoAccepted: kitchenUnconfirmed,
          kitchenConfirmedAt: kitchenUnconfirmed ? null : new Date(),
        }),
      });
    } catch (err) {
      this.logger.warn(`status emit failed for order ${orderId}: ${(err as Error).message}`);
    }
  }

  private async lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  }

  /** Runs `fn` in a transaction; a concurrent second open round loses on the partial unique index and
   *  reads as the same 409 the pre-check gives. */
  private async inTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException({ reason: "substitution_open", message: "The customer is still answering your last changes." });
      }
      throw err;
    }
  }
}

/** Exported for the response mapper: the round as the wire shape, with the photo of each swap. */
export function toSubstitutionRoundView(
  round: RoundWithLines,
  ctx: { keptSubtotal: number; swapPhotos?: ReadonlyMap<string, string | null> },
) {
  return {
    id: round.id,
    kind: (round.kind === "mid_prep" ? "mid_prep" : "at_accept") as "at_accept" | "mid_prep",
    status: round.status as "open" | "confirmed" | "timed_out" | "applied" | "cancelled",
    createdAt: round.createdAt.toISOString(),
    deadlineAt: round.deadlineAt?.toISOString() ?? null,
    resolvedAt: round.resolvedAt?.toISOString() ?? null,
    lines: round.lines.map((l) => ({
      id: l.id,
      itemId: l.orderItemId,
      action: l.action as "remove" | "swap" | "reduce",
      name: l.nameSnapshot,
      priceUsd: Number(l.priceUsd),
      quantity: l.fromQuantity,
      newQuantity: l.action === "reduce" ? l.toQuantity : null,
      swapDishId: l.swapDishId,
      swapName: l.swapNameSnapshot,
      swapPriceUsd: l.swapPriceUsd != null ? Number(l.swapPriceUsd) : null,
      swapQuantity: l.swapQuantity,
      swapPhotoUrl: (l.swapDishId && ctx.swapPhotos?.get(l.swapDishId)) ?? null,
      answer: (l.answer === "accept" || l.answer === "remove" ? l.answer : null) as "accept" | "remove" | null,
    })),
    wasTotal: Number(round.wasTotal),
    keptSubtotal: ctx.keptSubtotal,
  };
}

export { ROUND_INCLUDE as SUBSTITUTION_ROUND_INCLUDE };
