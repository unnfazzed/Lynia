"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { foodOrderMoney, type MerchantOrderResponse, type MerchantProfileResponse } from "@lynia/shared";
import { Icon } from "../../../components/icons";
import { Kitchen } from "../../../components/Kitchen";
import { useKitchenConnection } from "../../../components/KitchenConnectionProvider";
import { AppBar } from "../../../components/m/AppBar";
import { ConfirmSheet } from "../../../components/m/ConfirmSheet";
import { StaticMap } from "../../../components/m/StaticMap";
import { useToast } from "../../../components/m/Toast";
import { OrderLines } from "../../../components/queue/order-parts";
import { CashCard, CodeCard, codeText, CtaBar, ProgressSteps, RiderCard } from "../../../components/queue/v2-parts";
import { boardItems } from "../../../lib/board";
import { HANDOVER_FALLBACK_ENABLED } from "../../../lib/config";
import { Note, PhotoRow, RoundLines } from "../../../components/queue/proof-parts";
import { ProposerSheet } from "../../../components/queue/proposer";
import { RetryableError } from "../../../components/RetryableError";
import { InfoStrip, PathCard, ReasonSheet, Sheet } from "../../../components/m/ReasonSheet";
import { ApiError, redirectIfSessionExpired } from "../../../lib/api-client";
import { useBusiness } from "../../../lib/business";
import { formatCountdown } from "../../../lib/countdown";
import { isNoRiderHold } from "../../../lib/order-groups";
import {
  cancelPreparing,
  closeOrder,
  confirmGoodsReturned,
  confirmPayment,
  confirmReturnedCash,
  dispatchCancel,
  dispatchResume,
  extendPrep,
  getOrder,
  markReady,
  proposeSubstitution,
  refundOrder,
  rejectOrder,
  releaseUnpaid,
  reportNonReturn,
  handoverLinkMessage,
  requestHandoverFallback,
  requestPayment,
  revealPickupCode,
} from "../../../lib/orders-api";
import { detailView, isAfterPickup, money, orderLabel, riderFirstName, slotLabel } from "../../../lib/orders-view";
import { changeableLines, openRound, proposalLines } from "../../../lib/substitution";
import { useNow } from "../../../lib/use-now";
import { countOf, doorProofLine, ORDER_FLOW as OF, vocabulary, type Vocabulary } from "../../../lib/vocabulary";
import { prescriptionHref } from "../../../lib/routes";

const POLL_MS = 5_000;

type Load = { status: "loading" } | { status: "ready"; order: MerchantOrderResponse } | { status: "error"; message: string };
type Confirm =
  | null
  | "cancel"
  | "force"
  | "no_cash"
  | "not_returned"
  | "hold_cancel"
  | "items"
  | "problem"
  | "decline_scheduled"
  // A wallet order placed before D-74: cancel it unpaid, confirm its payment, or refund and cancel it.
  | "release"
  | "paid"
  | "refund";

/** What every order screen below needs from the page. */
interface Ctx {
  order: MerchantOrderResponse;
  act: (action: () => Promise<unknown>, done: string, leave?: boolean) => Promise<void>;
  disabled: boolean;
  error: string | null;
  setConfirm: (c: Confirm) => void;
  toast: (m: string) => void;
  business: MerchantProfileResponse | null;
  v: Vocabulary;
}

/** A wallet order placed before D-74 that the customer paid for, which LyniaGo never held: cancelling it
 *  means the business sends the money back first and records its own reference (D-12). */
/** K3b/K3c's sub-line: who is called off, and when they were due (A2: no time, no "for HH:MM"). */
function cancelSub(order: MerchantOrderResponse): string {
  const rider = riderFirstName(order);
  if (!order.riderId || !rider) return "We tell the customer.";
  return order.riderEtaAt
    ? `${rider} is booked for ${hm(order.riderEtaAt)}. We call off the rider and tell the customer.`
    : `${rider} is booked. We call off the rider and tell the customer.`;
}

/** K5c's reason line, from the rider's door proof. */
function failReason(order: MerchantOrderResponse): string {
  const r = order.doorProof?.reason;
  return r === "customer_unreachable" ? "Customer didn't answer" : r === "left_at_gate" ? "Couldn't hand it over" : "Couldn't deliver";
}

function isShop(order: MerchantOrderResponse, business: { businessType?: string } | null): boolean {
  return (order.venue?.businessType ?? business?.businessType) === "shop";
}

/** K3b's reasons; a shop's problem is "Shop problem (power, stock count)". */
function cantFinishReasons(shop: boolean) {
  return [
    ["ran_out", "Ran out and can't swap"],
    ["kitchen_problem", shop ? "Shop problem (power, stock count)" : "Kitchen problem (gas, power, water)"],
    ["too_busy", "Too busy to finish it"],
    ["other", "Something else"],
  ] as const;
}

function isPaidWallet(order: MerchantOrderResponse): boolean {
  return order.paymentMethod === "wallet" && !!order.merchantPaymentConfirmedAt;
}

function hm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The rider's name as the handoff writes it ("Tendai M."), or "The rider" before one is known. */
function riderName(order: MerchantOrderResponse): string {
  return riderFirstName(order) ?? "The rider";
}

/** The rider's first name inside a sentence ("Say the code to Tendai"), or "the rider" when they have
 *  none (E2E 2026-10-05 P-12: the checklist read "photographs it" / "Say the code to"). */
function riderInSentence(order: MerchantOrderResponse): string {
  return order.rider?.firstName.trim() || "the rider";
}

/** The same at the start of a sentence: "The rider photographs it". */
function capitalised(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * One order, pushed from the Orders home (fixed parent `/queue`), on the screen its state calls for.
 * Order flow v2 (packages/design/handoff/order-flow-v2, ledger D-59) over merchant mobile (D-48):
 *
 * - M3a/M3b ticket — the prep ring with "Cooking · ready 12:36" (shops: Packing), the priced lines,
 *   "Change items", the customer's four-step track, "Can't finish this order", then "Food is ready"
 *   (shops: "Order is packed").
 * - M4 hand-over — the rider, the six-digit pickup code read out 3+3 ("731 604"), "Tendai entered the
 *   code" once it matched, the order total, then "Hand over". Before a rider accepts it says so, and a
 *   no-rider hold offers "Keep searching" or cancelling.
 * - M5 tracking — the map, "#A1B2 on the way", the rider, the four-step track and the merchant-only
 *   "Cash back to you" row (B6's eight-step stepper is retired), "Mark ride completed" (after pickup).
 * - M6a cash back / M6b goods back — the hero, then "I got $15.00" or "I got the food back".
 *
 * An auto-accepted order the kitchen hasn't confirmed rings on the Orders home (M1a), like a new one.
 *
 * Round 2: "Change items" is the proposer (U4a); while the customer answers, the ticket waits (M2) with
 * the round's countdown and "Order is packed" held. Shops get the seal reminder (M3b) and hand over only
 * once the rider's sealed-bag photo is in (M4b → M4); a door photo shows on tracking (M5b) and on goods
 * back (M6b). A scheduled order that hasn't rung opens on its ticket (M7b). A pharmacy order with a
 * prescription to check offers the pharmacist the Prescription check (M8a). The ETA pill on M5 is not on
 * the merchant read, so it is not drawn.
 *
 * Cash only (BRIEF §14, ledger D-74): the API takes no new wallet order, and the old wallet lane (the
 * order card, its payment sheets, the CASH / WALLET tag) is gone. A wallet order an older install placed
 * before then still finishes on these parts: it waits for its payment on its own ticket, and once paid
 * it cooks like any other, its "Can't finish this order" asking for the refund reference.
 */
export default function OrderPage() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const toast = useToast();
  const business = useBusiness();
  const { actionsDisabled, signOut } = useKitchenConnection();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The payment or refund reference a wallet order's confirm sheet asks for; a fresh one per sheet.
  const [reference, setReference] = useState("");
  useEffect(() => setReference(""), [confirm]);
  // K4 (BRIEF §5): no hand-over button — the rider's code entry moves the screen on, and says so once.
  const lastStatus = useRef<string | null>(null);
  const busyRef = useRef(false);

  // The poll mustn't restart whenever the provider hands out a new signOut.
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const refresh = useCallback(async () => {
    try {
      const order = await getOrder(id);
      setLoad({ status: "ready", order });
    } catch (err) {
      if (redirectIfSessionExpired(err, () => signOutRef.current())) return;
      setLoad((prev) => (prev.status === "ready" ? prev : { status: "error", message: err instanceof ApiError ? err.message : "Couldn't load this order." }));
    }
  }, [id]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // A ringing order is answered on the Orders home, where the alarm and the takeover are.
  useEffect(() => {
    if (load.status === "ready" && detailView(load.order) === "ringing") router.replace("/queue");
  }, [load, router]);

  useEffect(() => {
    if (load.status !== "ready") return;
    const was = lastStatus.current;
    lastStatus.current = load.order.status;
    if (was && was !== "picked_up" && load.order.status === "picked_up") toast(`Handed over · ${riderName(load.order)} has it`);
  }, [load, toast]);

  /** Runs an action once, refreshes, and toasts; `leave` returns to the Orders home afterwards. */
  async function act(action: () => Promise<unknown>, done: string, leave = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirm(null);
      toast(done);
      if (leave) router.replace("/queue");
      else await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  if (load.status !== "ready") {
    return (
      <Kitchen active="queue" tabs={false}>
        <AppBar back="/queue" />
        <div className="m-bd">{load.status === "loading" ? <div className="m-hint">Loading…</div> : <RetryableError message={load.message} onRetry={() => void refresh()} />}</div>
      </Kitchen>
    );
  }

  const order = load.order;
  const view = detailView(order);
  const disabled = actionsDisabled || busy;
  const v = vocabulary(business?.businessType, business?.shopKind);
  const confirmSheet = renderConfirm();
  const ctx: Ctx = { order, act, disabled, error, setConfirm, toast, business, v };

  if (view === "ringing") return null;

  return (
    <Kitchen active="queue" tabs={false}>
      {view === "scheduled" && <Scheduled {...ctx} />}
      {view === "payment" && <Payment {...ctx} />}
      {view === "cooking" && <Cooking {...ctx} />}
      {view === "handover" && <Handover {...ctx} />}
      {(view === "tracking" || view === "delivered") && <OnTheWay {...ctx} />}
      {view === "closed" && <Closed order={order} />}
      {confirmSheet}
    </Kitchen>
  );

  /** The reference field a wallet order's payment or refund confirm needs (the API keeps up to 80). */
  function referenceField(label: string) {
    return (
      <div className="m-fld">
        <label htmlFor="m-ref">{label}</label>
        <span className="m-in">
          <input id="m-ref" value={reference} maxLength={80} autoComplete="off" onChange={(e) => setReference(e.target.value)} />
        </span>
      </div>
    );
  }

  function renderConfirm() {
    const close = () => {
      setConfirm(null);
      setError(null);
    };
    switch (confirm) {
      case "items":
        return (
          <ProposerSheet
            order={order}
            busy={busy}
            error={error}
            making={v.making.toLowerCase()}
            onSend={(p) => void act(() => proposeSubstitution(order.id, { lines: proposalLines(order, p.changes) }), "Changes sent · the customer has 3 minutes")}
            onCancel={close}
          />
        );
      case "problem":
        // K3a (Merchant v2 follow-ups, D-77).
        return (
          <Sheet
            title={`Problem with ${orderLabel(order)}?`}
            sub="Pick what happened."
            onClose={close}
            actions={
              <button type="button" className="m-btn2" onClick={close}>
                Close
              </button>
            }
          >
            {changeableLines(order).length > 0 && (
              <PathCard
                icon="arrow-left-right"
                tone="mint"
                title="Something ran out"
                sub="Change items: swap or remove, then the customer OKs it"
                onClick={() => setConfirm("items")}
              />
            )}
            <PathCard
              icon="x"
              tone="red"
              title="Can't finish this order"
              sub="Cancel with a reason. The customer and rider are told."
              onClick={() => setConfirm(isPaidWallet(order) ? "refund" : "cancel")}
            />
            <div className="m-sheethint">
              <Icon name="clock" size={16} />
              Just running late? Use +5 min on the ticket.
            </div>
          </Sheet>
        );
      case "decline_scheduled":
        return (
          <ConfirmSheet
            title="Decline this order?"
            body="The customer is told straight away."
            confirmLabel="Decline order"
            busy={busy}
            error={error}
            onConfirm={() => void act(() => rejectOrder(order.id, "other"), "Declined · the customer was told", true)}
            onCancel={close}
          />
        );
      case "cancel":
        // K3b: a cash order — nothing to refund.
        return (
          <ReasonSheet
            title={`Cancel ${orderLabel(order)}?`}
            sub={cancelSub(order)}
            reasons={cantFinishReasons(isShop(order, business))}
            noteFor="other"
            noteHelper={`${order.customerFirstName?.trim() || "The customer"} sees this note.`}
            extra={() => <InfoStrip icon="banknote">Cash order · nothing to refund</InfoStrip>}
            cta="Cancel order"
            secondary={`Keep ${v.making.toLowerCase()}`}
            busy={busy}
            error={error}
            onConfirm={(reason, note) => void act(() => cancelPreparing(order.id, note ? { reason, note } : { reason }), "Order cancelled · customer told", true)}
            onCancel={close}
          />
        );
      case "release":
        return (
          <ConfirmSheet
            title="Cancel this order?"
            body="Only if they never paid. The customer is told."
            confirmLabel="Cancel order"
            busy={busy}
            error={error}
            onConfirm={() => void act(() => releaseUnpaid(order.id, "other"), "Order cancelled · customer told", true)}
            onCancel={close}
          />
        );
      case "paid": {
        // The API checks the amount against the order (D-06); the merchant checks their own statement.
        const amount = order.merchantGoodsTotal ?? 0;
        return (
          <ConfirmSheet
            title={`Is ${money(amount)} in your statement?`}
            body="Check your own statement, not a screen someone shows you."
            confirmLabel={OF.cashBtn(money(amount))}
            danger={false}
            busy={busy}
            confirmDisabled={!reference.trim()}
            error={error}
            onConfirm={() => void act(() => confirmPayment(order.id, { reference: reference.trim(), amount }), `Payment confirmed · start ${v.making.toLowerCase()}`)}
            onCancel={close}
          >
            {referenceField("Reference")}
          </ConfirmSheet>
        );
      }
      case "refund": {
        // K3c: a wallet order placed before D-74 — the customer is refunded first, then it's cancelled. The
        // merchant refunds over mobile money, so the API still needs that refund's reference (D-77 §4).
        const amount = order.merchantGoodsTotal ?? 0;
        return (
          <ReasonSheet
            title={`Cancel ${orderLabel(order)}?`}
            sub={cancelSub(order)}
            reasons={cantFinishReasons(isShop(order, business))}
            noteFor="other"
            noteHelper={`${order.customerFirstName?.trim() || "The customer"} sees this note.`}
            extra={() => (
              <>
                <InfoStrip tone="gold" icon="wallet">
                  <b>Paid by wallet · {money(amount)}</b>
                  We refund the customer first, then cancel.
                </InfoStrip>
                {referenceField("Refund reference")}
              </>
            )}
            cta={`Refund ${money(amount)} and cancel`}
            busyCta="Refunding…"
            secondary={`Keep ${v.making.toLowerCase()}`}
            busy={busy}
            confirmDisabled={!reference.trim()}
            error={error}
            onConfirm={() =>
              void act(async () => {
                try {
                  await refundOrder(order.id, reference.trim(), amount);
                } catch (err) {
                  if (err instanceof ApiError && err.status === 401) throw err;
                  throw new ApiError(err instanceof ApiError ? err.status : 0, "Couldn't refund right now. The order is still open; try again.");
                }
              }, "Refunded · order cancelled", true)
            }
            onCancel={close}
          />
        );
      }
      case "hold_cancel":
        return (
          <ConfirmSheet
            title="Cancel this order?"
            body="No rider took it. The customer is told."
            confirmLabel="Cancel order"
            busy={busy}
            error={error}
            onConfirm={() => void act(() => dispatchCancel(order.id), "Order cancelled · customer told", true)}
            onCancel={close}
          />
        );
      case "force":
        return (
          <ConfirmSheet
            title="Mark this ride completed?"
            body="This closes the order now, even if steps are left."
            confirmLabel="Mark completed"
            danger={false}
            busy={busy}
            error={error}
            onConfirm={() => void act(() => closeOrder(order.id, "force"), "Ride marked completed · order closed", true)}
            onCancel={close}
          />
        );
      case "no_cash":
        return (
          <ConfirmSheet
            title="Close without cash?"
            body="Nothing will show as owed for this order."
            confirmLabel="Close order"
            danger={false}
            busy={busy}
            error={error}
            onConfirm={() => void act(() => closeOrder(order.id, "no_cash"), "Completed · no cash expected", true)}
            onCancel={close}
          />
        );
      case "not_returned":
        // K5c (D-77 follow-ups): the reasons-sheet pattern with one confirm; support takes it from there.
        return (
          <Sheet
            title={`${v.goodsBack === "I got the food back" ? "Food" : "Goods"} not returned?`}
            sub="We flag it to LyniaGo support, who follow it up with the rider."
            onClose={close}
            actions={
              <>
                {error && (
                  <div className="m-alert" role="alert">
                    {error}
                  </div>
                )}
                <button type="button" className="m-btn m-danger" disabled={busy} onClick={() => void act(() => reportNonReturn(order.id), "We've told LyniaGo. We'll WhatsApp you.", true)}>
                  Report to LyniaGo
                </button>
                <button type="button" className="m-btn2" disabled={busy} onClick={close}>
                  Go back
                </button>
              </>
            }
          >
            {null}
          </Sheet>
        );
      default:
        return null;
    }
  }
}

/** A pushed screen that fills the scroll area, so its CTA bar sits at the bottom however short it is. */
function Fill({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>{children}</div>;
}

// ── M7b ────────────────────────────────────────────────────────────────────────────────────────
function Scheduled({ order, disabled, setConfirm }: Ctx) {
  const now = useNow(60_000);
  const s = order.scheduledFor ? slotLabel(order.scheduledFor, new Date(now)) : null;
  return (
    <Fill>
      <AppBar back="/queue" title={orderLabel(order)} right={<span className="m-num">{money(order.merchantGoodsTotal)}</span>} />
      <div className="m-bd" style={{ flex: 1, paddingTop: 4 }}>
        <ProgressSteps step={1} label="Scheduled" />
        {s && (
          <Note icon="calendar" title={OF.schedT(`${s.day} ${s.slot}`)}>
            {order.ringsAt && (
              <>
                <br />
                {OF.schedBody(hm(order.ringsAt))}
              </>
            )}
          </Note>
        )}
        <div className="m-linescard">
          <OrderLines order={order} />
        </div>
      </div>
      <CtaBar>
        <button type="button" className="m-btn2" disabled={disabled} onClick={() => setConfirm("decline_scheduled")}>
          {OF.decline}
        </button>
      </CtaBar>
    </Fill>
  );
}

// ── K3 (M3a/M3b) / M2 ──────────────────────────────────────────────────────────────────────────
/**
 * K3 · the cooking ticket (Merchant v2, ledger D-77): the back header with the number and total, the
 * five-step bar at "Step 2 of 5 · Cooking", the big countdown with the ready time and the rider line,
 * the lines, "+5 min" and "Change items", the red "Problem with this order?" pill, then "Food is ready"
 * (shops: "Packed") in the pinned bar.
 */
function Cooking(ctx: Ctx) {
  const { order, act, disabled, error, setConfirm, v, business } = ctx;
  const now = useNow();
  const round = openRound(order);
  // M2 also stands in for a shortened order sent before Order flow v2 (the 60-second approval): the
  // customer is answering, so nothing here is marked ready until they have.
  if (round || order.merchantPhase === "awaiting_item_approval") {
    return <Waiting {...ctx} deadlineAt={round ? round.deadlineAt : order.itemApprovalDeadlineAt} swaps={!!round} now={now} />;
  }
  const startMs = order.prepStartedAt ? new Date(order.prepStartedAt).getTime() : now;
  const totalMs = (order.prepMinutes ?? 15) * 60_000;
  const leftMs = Math.max(0, startMs + totalMs - now);
  const readyBy = hm(new Date(startMs + totalMs).toISOString());
  const canChange = changeableLines(order).length > 0;
  const rxToCheck = order.prescription?.status === "pending" && business?.myIsPharmacist === true;
  const rider = riderFirstName(order);
  // Merchant v2 (D-77): the rider's arrival, from their location pings, once there's one to show.
  const riderLine =
    order.riderId && rider
      ? order.riderArrivedAt
        ? `${rider} is at your counter`
        : order.riderEtaAt
          ? `${rider} arrives ${hm(order.riderEtaAt)}`
          : // A2: no estimate — drop the time, keep the sentence whole (muted).
            `${rider} is on the way to you`
      : order.dispatchAttempt > 0
        ? "Finding a rider"
        : "We book the rider to arrive as it’s ready";
  return (
    <Fill>
      <AppBar back="/queue" title={orderLabel(order)} right={<span className="m-num">{money(order.merchantGoodsTotal)}</span>} />
      <div className="m-bd" style={{ flex: 1, paddingTop: 4 }}>
        <ProgressSteps step={2} label={v.making} />
        <div className="m-cdcard">
          <div>
            <b className="m-num">{formatCountdown(leftMs)}</b>
            <span className="m-num">left · ready {readyBy}</span>
          </div>
          <p data-quiet={(order.riderId && rider && !order.riderArrivedAt && !order.riderEtaAt) || undefined}>
            <Icon name="bike" size={16} />
            {riderLine}
          </p>
        </div>
        <div className="m-linescard">
          <OrderLines order={order} />
        </div>
        {rxToCheck && (
          <Link href={prescriptionHref(order.id)} className="m-btn m-sm">
            <Icon name="file-text" size={18} />
            {OF.rxT}
          </Link>
        )}
        <div className="m-pillrow">
          <button type="button" className="m-gh" disabled={disabled} onClick={() => void act(() => extendPrep(order.id), "Ready time pushed back 5 min · customer told")}>
            <Icon name="clock" size={16} />
            +5 min
          </button>
          {canChange && (
            <button type="button" className="m-gh" disabled={disabled} onClick={() => setConfirm("items")}>
              <Icon name="pencil" size={16} />
              {OF.changeItems}
            </button>
          )}
        </div>
        {error && <div className="m-alert" role="alert">{error}</div>}
        <button type="button" className="m-problem" disabled={disabled} onClick={() => setConfirm("problem")}>
          Problem with this order?
        </button>
      </div>
      <CtaBar>
        <button type="button" className="m-btn" disabled={disabled} onClick={() => void act(() => markReady(order.id), "Marked ready · finding a rider")}>
          {v.readyCta}
        </button>
      </CtaBar>
    </Fill>
  );
}

// ── K4 / S3 ────────────────────────────────────────────────────────────────────────────────────
/**
 * K4 · hand over (Merchant v2, ledger D-77): the rider card with a call button, the six-digit code read
 * aloud ("SAY THIS CODE TO BLESSING", 720 518) and "Waiting for Blessing to type it. This screen moves on
 * by itself." There is no hand-over button: the rider's code entry moves the order on (BRIEF §5).
 *
 * S3 · a shop or pharmacy hands over on a 3-step checklist: Seal the bag → the rider photographed it
 * (with the thumbnail) → say the code. Before a rider takes it, it says so; a no-rider hold offers
 * "Keep searching" or cancelling.
 */
function Handover({ order, act, disabled, error, setConfirm, business }: Ctx) {
  const hold = isNoRiderHold(order);
  const shop = (order.venue?.businessType ?? business?.businessType) === "shop" || order.pickupProofRequired === true;
  const code = usePickupCode(order);
  const first = riderInSentence(order);
  const proof = order.pickupProof?.photoUrl || order.pickupProof?.takenAt ? order.pickupProof : null;
  const fallback = HANDOVER_FALLBACK_ENABLED && order.riderId && order.status === "en_route_pickup";
  return (
    <Fill>
      <AppBar back="/queue" title={OF.handTitle(orderLabel(order))} />
      <div className="m-bd" style={{ flex: 1, paddingTop: 4 }}>
        {!shop && <ProgressSteps step={3} label="Hand over" />}
        {order.rider ? (
          <RiderCard order={order} />
        ) : hold ? (
          <div className="m-card" style={{ background: "var(--highlight-wash)", borderColor: "var(--highlight-border)" }}>
            <b style={{ fontSize: 15 }}>No rider yet</b>
            <span className="m-hint" style={{ fontSize: 13 }}>
              Nobody has taken it so far. Keep searching, or cancel and the customer is told.
            </span>
            <button type="button" className="m-btn m-sm" disabled={disabled} onClick={() => void act(() => dispatchResume(order.id), "Searching again")}>
              Keep searching
            </button>
            <button type="button" className="m-lnk m-red" disabled={disabled} onClick={() => setConfirm("hold_cancel")}>
              Cancel order
            </button>
          </div>
        ) : (
          <div className="m-waitrow">
            <span className="m-wspin" />
            Finding a rider. The code appears once one takes it.
          </div>
        )}

        {order.riderId && !order.autoAccepted && shop && (
          <>
            <div className="m-check">
              <div>
                <i className={proof?.bagSealed || proof ? "m-on" : undefined}>{proof?.bagSealed || proof ? <Icon name="check" size={16} /> : 1}</i>
                <div>
                  <b>{OF.sealT}</b>
                  <span>Sticker or stapled receipt</span>
                </div>
              </div>
              <div>
                <i className={proof ? "m-on" : undefined}>{proof ? <Icon name="check" size={16} /> : 2}</i>
                <div>
                  <b>{proof ? `${capitalised(first)} photographed it` : `${capitalised(first)} photographs it`}</b>
                  <span>{proof ? `${hm(proof.takenAt)} · the customer sees this too` : OF.photoWait(riderFirstName(order) ?? first)}</span>
                </div>
                {proof?.photoUrl ? (
                  <a href={proof.photoUrl} target="_blank" rel="noreferrer" aria-label={OF.photo}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived proof URL */}
                    <img src={proof.photoUrl} alt="" className="m-thumb" />
                  </a>
                ) : null}
              </div>
              <div>
                <i>3</i>
                <div>
                  <b>Say the code to {first}</b>
                  {code && <span className="m-bigcode m-num">{codeText(code)}</span>}
                </div>
              </div>
            </div>
            <p className="m-hint" style={{ textAlign: "center", fontSize: 13 }}>
              The order moves on when {first} types the code.
            </p>
          </>
        )}

        {order.riderId && !order.autoAccepted && !shop && (
          <>
            <CodeCard rider={first} code={code} />
            <div className="m-waitrow">
              <span className="m-wspin" />
              Waiting for {first} to type it. This screen moves on by itself.
            </div>
          </>
        )}

        {order.riderId && order.autoAccepted && (
          <div className="m-waitrow">
            <span className="m-wspin" />
            {capitalised(first)} collects it at the counter. This screen moves on by itself.
          </div>
        )}

        {!shop && (
          <div className="m-sumrow">
            <span>{boardItems(order)}</span>
            <b className="m-num">{money(order.merchantGoodsTotal)}</b>
          </div>
        )}
        {fallback && (
          <button
            type="button"
            className="m-btn2"
            disabled={disabled}
            onClick={() =>
              void act(async () => {
                // The link goes from the counter's own phone (the rider may have no data for the app, but SMS works).
                const res = await requestHandoverFallback(order.id);
                const body = handoverLinkMessage(business?.name ?? "the counter", orderLabel(order), res.link);
                window.location.href = `sms:${res.riderPhone ?? ""}?body=${encodeURIComponent(body)}`;
              }, `${capitalised(first)} got a link to finish it`)
            }
          >
            Rider can’t enter code
          </button>
        )}
        {error && <div className="m-alert" role="alert">{error}</div>}
      </div>
    </Fill>
  );
}

// ── K5 ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * K5 · on the way + cash back (Merchant v2, ledger D-77): one screen that follows the order — the map,
 * "#A111 on the way" (then "Delivered 07:41", or "Not delivered"), the five-step bar, the cash card
 * (food only, the delivery fee shown as the rider's, when it is due back), the door photo, and the
 * pinned "I got $12.00", held "· after delivery" until the order is delivered. An order that wasn't
 * delivered brings the goods back instead. It replaces the tracking, delivered and goods-back screens.
 */
function OnTheWay({ order, act, disabled, error, setConfirm, business, v }: Ctx) {
  const delivered = order.status === "delivered" || order.status === "completed";
  const failed = order.status === "undelivered";
  const cashBack = order.paymentMethod === "cash" && order.merchantCashRule === "collect_and_return";
  const amount =
    order.debtAmount ??
    foodOrderMoney({ goodsTotal: order.merchantGoodsTotal, deliveryFee: order.deliveryFee, merchantDeliveryShare: order.merchantDeliveryShare }).merchantNet;
  const rider = riderName(order);
  const first = capitalised(riderInSentence(order));
  const owes = order.debtStatus === "open";
  // K5b / K5c (D-77 follow-ups): "#A115 delivered" · "Blessing M. · 07:41 · 2 dishes"; "#A117 couldn't be
  // delivered" · "Customer didn't answer · 07:44".
  const label = orderLabel(order);
  const title = delivered ? `${label} delivered` : failed ? `${label} couldn't be delivered` : OF.trackT(label);
  // A2: "arrives 07:38", or "on the way" with no estimate — never "arrives —".
  const eta = delivered || failed ? null : order.riderEtaAt ? `arrives ${hm(order.riderEtaAt)}` : "on the way";
  const failedAt = order.doorProof?.takenAt ?? null;
  const sub = failed
    ? [failReason(order), failedAt ? hm(failedAt) : null].filter(Boolean).join(" · ")
    : [order.rider ? rider : null, delivered && order.deliveredAt ? hm(order.deliveredAt) : eta, countOf(order.items.length, v)].filter(Boolean).join(" · ");
  const prepaid = order.paymentMethod === "wallet" ? `Paid by wallet · ${money(order.merchantGoodsTotal)}` : `Paid at pickup · ${money(order.merchantGoodsTotal)}`;
  const cashLine = order.cashDueAt ? `${first} brings it back by ${hm(order.cashDueAt)}` : `${first} brings it back after delivery`;
  return (
    <Fill>
      <StaticMap center={business?.location?.point ?? null} height={250}>
        <Link href="/queue" className="m-mapback" aria-label="Back">
          <Icon name="chevron-left" size={20} />
        </Link>
      </StaticMap>
      <div className="m-k5">
        <div>
          <b>{title}</b>
          <span>{sub}</span>
        </div>
        <ProgressSteps step={delivered ? 5 : 4} failed={failed} />
        {failed ? (
          <div className="m-goodsback">
            <div>
              <Icon name="package" size={20} />
              <span>{OF.goodsBackT}</span>
            </div>
            <b className="m-num">
              {boardItems(order)} · {money(order.merchantGoodsTotal)}
            </b>
            <p>{order.cashDueAt ? `${rider} brings it back by ${hm(order.cashDueAt)}` : `${rider} is bringing it back`}</p>
          </div>
        ) : cashBack ? (
          <CashCard
            amount={amount}
            food={amount}
            delivery={order.deliveryFee}
            line={cashLine}
            foodLabel={(order.venue?.businessType ?? business?.businessType) === "shop" ? "Goods" : "Food"}
          />
        ) : null}
        {/* K5c draws no attempt photo; the goods card is the screen (D-77 follow-ups). */}
        {failed ? null : order.doorProof ? (
          <PhotoRow title={OF.doorPhoto} sub={doorProofLine(order.doorProof, hm(order.doorProof.takenAt))} url={order.doorProof.photoUrl} />
        ) : (
          !delivered &&
          !failed && (
            <div className="m-photorow">
              <i>
                <Icon name="camera" size={16} />
              </i>
              <span>The door photo shows here once it’s delivered</span>
            </div>
          )
        )}
        {delivered && !cashBack && (
          <InfoStrip tone="mint" icon="wallet">
            <b>{prepaid}</b>
            Nothing to bring back. It&apos;s in your Money tab.
          </InfoStrip>
        )}
        {error && <div className="m-alert" role="alert">{error}</div>}
        {!cashBack && !failed && !delivered && isAfterPickup(order) && (
          <button type="button" className="m-lnk" style={{ minHeight: "var(--target-min)", fontSize: 13 }} disabled={disabled} onClick={() => setConfirm("force")}>
            Mark ride completed
          </button>
        )}
      </div>
      {failed ? (
        <CtaBar>
          <button type="button" className="m-btn" disabled={disabled} onClick={() => void act(() => confirmGoodsReturned(order.id), "Goods back · order closed", true)}>
            {v.goodsBack}
          </button>
          {/* R-07: the merchant's only way to flag goods that never came back. */}
          <button type="button" className="m-btn2 m-danger-ink" disabled={disabled} onClick={() => setConfirm("not_returned")}>
            It wasn&apos;t returned
          </button>
        </CtaBar>
      ) : cashBack ? (
        <CtaBar>
          {delivered && owes ? (
            <>
              <button type="button" className="m-btn" disabled={disabled} onClick={() => void act(() => confirmReturnedCash(order.id, amount), "Cash confirmed · order closed", true)}>
                {OF.cashBtn(money(amount))}
              </button>
              <button type="button" className="m-btn2" disabled={disabled} onClick={() => setConfirm("no_cash")}>
                {OF.noCash}
              </button>
            </>
          ) : (
            <button type="button" className="m-btn m-off" disabled>
              {OF.cashBtn(money(amount))} · after delivery
            </button>
          )}
        </CtaBar>
      ) : null}
    </Fill>
  );
}

// ── M2 ─────────────────────────────────────────────────────────────────────────────────────────
/** M2 · waiting for the customer: the round's countdown, "Start packing the rest…", the lines with
 *  "Swap asked" / "Removing", and the ready button held until the customer answers (or time runs out).
 *  A shortened order from before Order flow v2 (`swaps` false) has no swaps and doesn't carry on by
 *  itself when time runs out, so it leaves out the line that says so. */
function Waiting({ order, v, deadlineAt, swaps, now }: Ctx & { deadlineAt: string | null; swaps: boolean; now: number }) {
  const left = deadlineAt ? formatCountdown(Math.max(0, new Date(deadlineAt).getTime() - now)) : null;
  return (
    <Fill>
      <AppBar back="/queue" title={orderLabel(order)} right={<span className="m-num">{money(order.merchantGoodsTotal)}</span>} />
      <div className="m-bd" style={{ flex: 1, paddingTop: 4 }}>
        <ProgressSteps step={2} label={v.making} />
        <div className="m-note" data-tone="ok" style={{ flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <b style={{ flex: 1, fontSize: 15 }}>{OF.mWait}</b>
            {left && <span className="m-cchip m-num">{left}</span>}
          </div>
          {swaps && <span>{OF.mWaitSub(v.making.toLowerCase())}</span>}
        </div>
        <div className="m-linescard">
          <RoundLines order={order} />
        </div>
      </div>
      <CtaBar>
        {left && <span className="m-ctahint">{OF.mWaitHint(left)}</span>}
        <button type="button" className="m-btn" disabled>
          {v.readyCta}
        </button>
      </CtaBar>
    </Fill>
  );
}

// ── A wallet order placed before D-74 ─────────────────────────────────────────────────────────────
/**
 * Not drawn: Order flow v2 is cash only (BRIEF §14) and the API refuses new wallet orders (ledger
 * D-74), but a wallet order an older install placed before then still waits here for the customer to
 * pay the business's own number. It is the ticket's parts with no payment tag: the note, the lines,
 * "Ask for payment" (an older app shows its pay screen only once asked), the red "Cancel order" for an
 * order that was never paid, and "I got $9.50" once the money is in the business's own statement — its
 * sheet asks for the reference. Paid, the order cooks like any other.
 */
function Payment({ order, act, disabled, error, setConfirm }: Ctx) {
  return (
    <Fill>
      <AppBar back="/queue" title={orderLabel(order)} right={<span className="m-num" style={{ fontSize: 15, fontWeight: 700 }}>{money(order.merchantGoodsTotal)}</span>} />
      <div className="m-bd" style={{ flex: 1, paddingTop: 12 }}>
        <Note tone="hi" icon="clock" title="Waiting for payment">
          <br />
          Start once it’s in your own statement.
        </Note>
        <div className="m-card" style={{ gap: 0, padding: "4px 12px" }}>
          <OrderLines order={order} />
        </div>
        {!order.paymentRequestedAt && (
          <button type="button" className="m-btn-sec" disabled={disabled} onClick={() => void act(() => requestPayment(order.id, true), "Payment asked for · customer told")}>
            Ask for payment
          </button>
        )}
        {error && <div className="m-alert" role="alert">{error}</div>}
        <button type="button" className="m-lnk m-red" style={{ minHeight: "var(--target-min)", fontSize: 14 }} disabled={disabled} onClick={() => setConfirm("release")}>
          Cancel order
        </button>
      </div>
      <CtaBar>
        <button type="button" className="m-btn" disabled={disabled} onClick={() => setConfirm("paid")}>
          {OF.cashBtn(money(order.merchantGoodsTotal))}
        </button>
      </CtaBar>
    </Fill>
  );
}

function Closed({ order }: Pick<Ctx, "order">) {
  const label =
    order.status === "cancelled" || order.status === "expired"
      ? "This order was cancelled"
      : order.merchantCloseReason
        ? "Closed · no cash expected"
        : "This order is closed";
  return (
    <>
      <AppBar back="/queue" title={orderLabel(order)} />
      <div className="m-bd" style={{ alignItems: "center", textAlign: "center", paddingTop: 48, gap: 10 }}>
        <Icon name="circle-check" size={32} color="var(--muted)" />
        <b style={{ fontSize: 18 }}>{label}</b>
        <Link href="/queue" className="m-lnk">
          Back to orders
        </Link>
      </div>
    </>
  );
}

/**
 * The pickup code for the rider in front of the merchant. Revealing rotates the code (N-16), so it is
 * asked for once per rider, never on every render; an auto-accepted order is collected without one.
 */
function usePickupCode(order: MerchantOrderResponse): string | null {
  const [code, setCode] = useState<string | null>(null);
  const askedFor = useRef<string | null>(null);
  const codeless = order.autoAccepted === true;
  useEffect(() => {
    if (codeless || !order.riderId || isAfterPickup(order) || askedFor.current === order.riderId) return;
    askedFor.current = order.riderId;
    revealPickupCode(order.id)
      .then((res) => setCode(res.pickupCode))
      .catch(() => {
        // Not silent for good: the next order refresh asks again (E2E 2026-10-05 LB-1 hid behind this).
        askedFor.current = null;
        setCode(null);
      });
  }, [codeless, order]);
  return code;
}

/**
 * K3's "Problem with this order?" (Merchant v2, ledger D-77): the same danger pill the rider has, which
 * replaces "Can't finish". It asks what's wrong: something ran out (the "Change items" proposer), or the
 * order can't be finished (cancel, or refund first for a paid wallet order from before D-74).
 */
