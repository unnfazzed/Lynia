"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantOrderResponse, MerchantProfileResponse } from "@lynia/shared";
import { Icon } from "../../../components/icons";
import { Kitchen } from "../../../components/Kitchen";
import { useKitchenConnection } from "../../../components/KitchenConnectionProvider";
import { AppBar } from "../../../components/m/AppBar";
import { ConfirmSheet } from "../../../components/m/ConfirmSheet";
import { StaticMap } from "../../../components/m/StaticMap";
import { useToast } from "../../../components/m/Toast";
import { OrderCard } from "../../../components/queue/OrderCard";
import { ChangeItemsSheet, editableLines, MerchantTrack, OrderLines, RiderRow } from "../../../components/queue/order-parts";
import { RetryableError } from "../../../components/RetryableError";
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
  editOrderItems,
  getOrder,
  logCall,
  markReady,
  refundOrder,
  releaseUnpaid,
  reportNonReturn,
  requestPayment,
  revealPickupCode,
} from "../../../lib/orders-api";
import { detailView, groupCode, isAfterPickup, money, orderLabel, riderFirstName } from "../../../lib/orders-view";
import { useNow } from "../../../lib/use-now";
import { countOf, ORDER_FLOW as OF, vocabulary, type Vocabulary } from "../../../lib/vocabulary";

const POLL_MS = 5_000;

type Load = { status: "loading" } | { status: "ready"; order: MerchantOrderResponse } | { status: "error"; message: string };
type Confirm = null | "cancel" | "force" | "no_cash" | "not_returned" | "hold_cancel" | "items";

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
  legacyHandlers: LegacyHandlers;
  setHandedOver: (v: boolean) => void;
}

type LegacyHandlers = Omit<React.ComponentProps<typeof OrderCard>, "order" | "bucket">;

function hm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The rider's name as the handoff writes it ("Tendai M."), or "The rider" before one is known. */
function riderName(order: MerchantOrderResponse): string {
  return riderFirstName(order) ?? "The rider";
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
 * The sealed-bag photo (M4b), the door photo (M5b) and the ETA pill wait on the backend (README "NEEDS
 * BACKEND"), so they are not drawn here.
 */
export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const business = useBusiness();
  const { actionsDisabled, signOut } = useKitchenConnection();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Hand over" is the merchant's own step after the rider's code matched (M4 → M5).
  const [handedOver, setHandedOver] = useState(false);
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
  let view = detailView(order);
  // M4 stays up once the code matched, until the merchant taps "Hand over".
  if (view === "tracking" && order.status === "picked_up" && !handedOver) view = "handover";
  const disabled = actionsDisabled || busy;
  const v = vocabulary(business?.businessType, business?.shopKind);
  const confirmSheet = renderConfirm();
  const ctx: Ctx = { order, act, disabled, error, setConfirm, toast, business, v, legacyHandlers: legacyHandlers(), setHandedOver };

  if (view === "ringing") return null;

  return (
    <Kitchen active="queue" tabs={false}>
      {view === "cooking" && <Cooking {...ctx} />}
      {view === "handover" && <Handover {...ctx} />}
      {view === "tracking" && <Tracking {...ctx} />}
      {view === "delivered" && <Delivered key={order.id} {...ctx} />}
      {view === "legacy" && <Legacy {...ctx} />}
      {view === "closed" && <Closed order={order} />}
      {confirmSheet}
    </Kitchen>
  );

  function legacyHandlers(): LegacyHandlers {
    const after = (p: Promise<unknown>) => p.then(() => refresh());
    return {
      disabled,
      onMarkReady: (orderId: string) => after(markReady(orderId)),
      onRevealPickupCode: async (orderId: string) => (await revealPickupCode(orderId)).pickupCode,
      onOpenHold: () => {},
      onLogCall: (orderId: string) => after(logCall(orderId)),
      onRequestPayment: (orderId: string, overrideCallLog: boolean) => after(requestPayment(orderId, overrideCallLog)),
      onConfirmPayment: (orderId: string, body: { reference: string; amount: number }) => after(confirmPayment(orderId, body)),
      onReleaseUnpaid: (orderId: string) => after(releaseUnpaid(orderId, "other")),
      onRefund: (orderId: string, body: { reference: string; amount: number }) => after(refundOrder(orderId, body.reference, body.amount)),
    };
  }

  function renderConfirm() {
    const close = () => {
      setConfirm(null);
      setError(null);
    };
    switch (confirm) {
      case "items":
        return (
          <ChangeItemsSheet
            order={order}
            busy={busy}
            error={error}
            onSave={(lines) => void act(() => editOrderItems(order.id, { lines }), "Items changed · customer told the new total")}
            onCancel={close}
          />
        );
      case "cancel":
        return (
          <ConfirmSheet
            title="Cancel this order?"
            body="The customer is told why. Nothing was paid, so there’s nothing to refund."
            confirmLabel="Cancel order"
            busy={busy}
            error={error}
            onConfirm={() => void act(() => cancelPreparing(order.id), "Order cancelled · customer told", true)}
            onCancel={close}
          />
        );
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
        return (
          <ConfirmSheet
            title="Food not returned?"
            body="LyniaGo support follows it up with the rider."
            confirmLabel="Report it"
            busy={busy}
            error={error}
            onConfirm={() => void act(() => reportNonReturn(order.id), "Reported · support will call you", true)}
            onCancel={close}
          />
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

/** The pinned CTA bar: one primary (52), optionally a hint line above it. */
function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-foot" style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "auto" }}>
      {children}
    </div>
  );
}

// ── M3a / M3b ──────────────────────────────────────────────────────────────────────────────────
function Cooking({ order, act, disabled, error, setConfirm, legacyHandlers, v }: Ctx) {
  const now = useNow();
  const startMs = order.prepStartedAt ? new Date(order.prepStartedAt).getTime() : now;
  const totalMs = (order.prepMinutes ?? 15) * 60_000;
  const leftMs = Math.max(0, startMs + totalMs - now);
  const pct = Math.min(100, Math.round(((totalMs - leftMs) / totalMs) * 100));
  const readyBy = hm(new Date(startMs + totalMs).toISOString());
  const wallet = order.paymentMethod === "wallet";
  const canChange = editableLines(order).length > 0;
  return (
    <Fill>
      <AppBar back="/queue" title={orderLabel(order)} right={<span className="m-num" style={{ fontSize: 15, fontWeight: 700 }}>{money(order.merchantGoodsTotal)}</span>} />
      <div className="m-bd" style={{ flex: 1, paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--accent-wash)", borderRadius: 12, padding: "10px 12px" }}>
          <div className="m-ring" style={{ width: 56, height: 56, background: `conic-gradient(var(--accent) 0 ${pct}%, #cdeeda ${pct}% 100%)` }}>
            <b>{formatCountdown(leftMs)}</b>
          </div>
          <div style={{ flex: 1, fontSize: 13 }}>
            <b style={{ fontSize: 15, display: "block" }}>
              {v.making} · ready {readyBy}
            </b>
            {OF.riderFound}
          </div>
        </div>
        <div className="m-card" style={{ gap: 0, padding: "4px 12px" }}>
          <OrderLines order={order} />
        </div>
        {canChange && (
          <button type="button" className="m-sec" disabled={disabled} onClick={() => setConfirm("items")}>
            <Icon name="pencil" size={15} />
            {OF.changeItems}
          </button>
        )}
        <MerchantTrack order={order} v={v} cashRow={false} />
        {error && <div className="m-alert" role="alert">{error}</div>}
        {wallet ? (
          // A paid WALLET order is refunded with the merchant's own reference (legacy lane).
          <OrderCard order={order} bucket="preparing" {...legacyHandlers} />
        ) : (
          <button type="button" className="m-lnk m-red" style={{ minHeight: "var(--target-min)", fontSize: 14 }} disabled={disabled} onClick={() => setConfirm("cancel")}>
            {OF.cantFinish}
          </button>
        )}
      </div>
      <Bar>
        <button type="button" className="m-btn" disabled={disabled} onClick={() => void act(() => markReady(order.id), "Marked ready · finding a rider")}>
          {v.readyCta}
        </button>
      </Bar>
    </Fill>
  );
}

// ── M4 ─────────────────────────────────────────────────────────────────────────────────────────
function Handover({ order, act, disabled, error, setConfirm, toast, setHandedOver }: Ctx) {
  const matched = isAfterPickup(order);
  const hold = isNoRiderHold(order);
  return (
    <Fill>
      <AppBar back="/queue" title={OF.handTitle(orderLabel(order))} />
      <div className="m-bd" style={{ flex: 1, paddingTop: 12 }}>
        {order.rider ? (
          <RiderRow order={order} />
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="m-av">
              <Icon name="bike" size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 15 }}>Finding a rider</b>
              <div className="m-hint" style={{ fontSize: 13 }}>
                The code appears once a rider takes it
              </div>
            </div>
          </div>
        )}
        <PickupCode key={order.riderId ?? "none"} order={order} matched={matched} />
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{OF.total}</span>
          <b className="m-num" style={{ fontSize: 20 }}>
            {money(order.merchantGoodsTotal)}
          </b>
        </div>
        {error && <div className="m-alert" role="alert">{error}</div>}
      </div>
      <Bar>
        <button
          type="button"
          className="m-btn"
          disabled={!matched}
          onClick={() => {
            setHandedOver(true);
            toast("Handed over · tracking the delivery");
          }}
        >
          {OF.handBtn}
        </button>
      </Bar>
    </Fill>
  );
}

// ── M5 ─────────────────────────────────────────────────────────────────────────────────────────
function Tracking({ order, disabled, error, setConfirm, business, v }: Ctx) {
  return (
    <>
      <StaticMap center={business?.location?.point ?? null} height={200}>
        <Link href="/queue" className="m-gh" aria-label="Back" style={{ position: "absolute", top: "calc(8px + env(safe-area-inset-top))", left: 10, width: 44, padding: 0, borderRadius: "50%", border: "none" }}>
          <Icon name="chevron-left" size={22} />
        </Link>
      </StaticMap>
      <div style={{ flex: 1, marginTop: -20, background: "var(--bg)", borderRadius: "20px 20px 0 0", position: "relative", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <b style={{ fontSize: 22, display: "block" }}>{OF.trackT(orderLabel(order))}</b>
          <div className="m-hint" style={{ fontSize: 13, marginTop: 4 }}>
            {countOf(order.items.length, v)} · {money(order.merchantGoodsTotal)}
          </div>
        </div>
        {order.rider && <RiderRow order={order} />}
        <MerchantTrack order={order} v={v} />
        {error && <div className="m-alert" role="alert">{error}</div>}
        <button type="button" className="m-lnk" style={{ minHeight: "var(--target-min)", fontSize: 13, marginTop: "auto" }} disabled={disabled} onClick={() => setConfirm("force")}>
          Mark ride completed
        </button>
      </div>
    </>
  );
}

// ── M6a / M6b ──────────────────────────────────────────────────────────────────────────────────
function Delivered({ order, act, disabled, error, setConfirm, v }: Ctx) {
  const now = useNow(30_000);
  const delivered = order.status === "delivered" || order.status === "completed";
  const amount = order.debtAmount ?? order.merchantGoodsTotal ?? 0;
  const dueMin = order.cashDueAt ? Math.round((new Date(order.cashDueAt).getTime() - now) / 60_000) : null;
  const rider = riderName(order);
  return (
    <>
      <div className="m-bd" style={{ paddingTop: 0 }}>
        <div className="m-hero" data-tone={delivered ? undefined : "calm"} style={{ position: "relative" }}>
          {/* M6 draws no bar; the way back to the Orders home sits on the hero, as M5's does on the map. */}
          <Link href="/queue" className="m-back" aria-label="Back" style={{ position: "absolute", top: 8, left: 6 }}>
            <Icon name="chevron-left" size={22} />
          </Link>
          <span>
            <Icon name={delivered ? "circle-check" : "package"} size={30} color={delivered ? "var(--accent-text)" : "var(--muted)"} />
          </span>
          <b>{delivered ? OF.delivered(hm(order.deliveredAt)) : OF.notDelivered}</b>
          {/* M6a's "Rudo confirmed with the code" names the customer, whom a merchant order never carries:
              the merchant-mobile B7 line stands in. */}
          <p>{delivered ? "Buyer confirmed with the code" : OF.backS}</p>
        </div>

        {delivered ? (
          <div className="m-card" style={{ border: "2px solid var(--highlight)", gap: 8 }}>
            <span className="m-cap" style={{ color: "var(--highlight-ink)" }}>
              {OF.cashT}
            </span>
            <b style={{ fontSize: 17 }}>{OF.cashS(rider, money(amount))}</b>
            {order.cashDueAt && dueMin !== null && (
              <span className="m-hint" style={dueMin < 0 ? { color: "var(--danger-ink)" } : undefined}>
                {dueMin < 0 ? `Due by ${hm(order.cashDueAt)} · ${-dueMin} min overdue` : OF.cashDue(hm(order.cashDueAt), dueMin)}
              </span>
            )}
            {error && <div className="m-alert" role="alert">{error}</div>}
            <button type="button" className="m-btn m-sm" disabled={disabled} onClick={() => void act(() => confirmReturnedCash(order.id, amount), "Cash confirmed · order closed", true)}>
              <Icon name="banknote" size={18} />
              {OF.cashBtn(money(amount))}
            </button>
            <button type="button" className="m-sec" disabled={disabled} onClick={() => setConfirm("no_cash")}>
              {OF.noCash}
            </button>
          </div>
        ) : (
          <div className="m-card" style={{ border: "2px solid var(--highlight)", gap: 8 }}>
            <span className="m-cap" style={{ color: "var(--highlight-ink)" }}>
              {OF.goodsBackT}
            </span>
            <b style={{ fontSize: 17 }}>{OF.backT(rider)}</b>
            <span className="m-hint">
              {[countOf(order.items.length, v), money(order.merchantGoodsTotal), order.cashDueAt ? OF.goodsDue(hm(order.cashDueAt)) : null].filter(Boolean).join(" · ")}
            </span>
            {error && <div className="m-alert" role="alert">{error}</div>}
            <button type="button" className="m-btn m-sm" disabled={disabled} onClick={() => void act(() => confirmGoodsReturned(order.id), "Food back · order closed", true)}>
              <Icon name="package" size={18} />
              {v.goodsBack}
            </button>
            {/* R-07: the merchant's only way to flag goods that never came back (merchant-mobile B7). */}
            <button type="button" className="m-lnk m-red" style={{ minHeight: "var(--target-min)", fontSize: 13.5 }} disabled={disabled} onClick={() => setConfirm("not_returned")}>
              It wasn’t returned
            </button>
          </div>
        )}

        {delivered && <MerchantTrack order={order} v={v} />}
      </div>
    </>
  );
}

function Legacy({ order, legacyHandlers }: Ctx) {
  return (
    <>
      <AppBar back="/queue" title={orderLabel(order)} />
      <div className="m-bd">
        <OrderCard order={order} bucket={order.merchantPhase === "awaiting_payment" ? "payment" : "waiting"} {...legacyHandlers} />
      </div>
    </>
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
 * M4's code card: "READ THIS PICKUP CODE TO TENDAI", the six digits 3+3 at 36/800, then "Tendai entered
 * the code" once it matched. Revealing rotates the code (N-16), so it is asked for once per rider, never
 * on every render; a code the screen never saw (opened after the match) isn't shown.
 */
function PickupCode({ order, matched }: Pick<Ctx, "order"> & { matched: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const askedFor = useRef<string | null>(null);
  // An auto-accepted order is collected without a code ("Collected" at the restaurant's pin).
  const codeless = order.autoAccepted === true;
  useEffect(() => {
    if (codeless || !order.riderId || matched || askedFor.current === order.riderId) return;
    askedFor.current = order.riderId;
    revealPickupCode(order.id)
      .then((res) => setCode(res.pickupCode))
      .catch(() => setCode(null));
  }, [matched]);
  if (!order.riderId || codeless) return null;
  const rider = riderName(order);
  const groups = code ? groupCode(code) : null;
  return (
    <div className="m-card" style={{ alignItems: "center", textAlign: "center" }}>
      <span className="m-cap">{OF.code(rider)}</span>
      {groups && (
        <div className="m-pcode" aria-label={`Pickup code ${code!.split("").join(" ")}`}>
          {groups.map((g, i) => (
            <span key={i}>{g}</span>
          ))}
        </div>
      )}
      {matched && (
        <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent-text)", fontSize: 13, fontWeight: 600 }}>
          <Icon name="circle-check" size={16} />
          {OF.codeOk(rider)}
        </span>
      )}
    </div>
  );
}
