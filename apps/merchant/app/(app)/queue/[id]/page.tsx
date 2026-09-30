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
import { Stepper } from "../../../components/m/Stepper";
import { useToast } from "../../../components/m/Toast";
import { OrderCard } from "../../../components/queue/OrderCard";
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
  getOrder,
  logCall,
  markReady,
  refundOrder,
  releaseUnpaid,
  reportNonReturn,
  requestPayment,
  revealPickupCode,
} from "../../../lib/orders-api";
import { detailView, isAfterPickup, money, orderLabel, riderFirstName, steps } from "../../../lib/orders-view";
import { useNow } from "../../../lib/use-now";

const POLL_MS = 5_000;

type Load = { status: "loading" } | { status: "ready"; order: MerchantOrderResponse } | { status: "error"; message: string };
type Confirm = null | "cancel" | "force" | "no_cash" | "not_returned" | "hold_cancel";

/** What every order screen below needs from the page. */
interface Ctx {
  order: MerchantOrderResponse;
  act: (action: () => Promise<unknown>, done: string, leave?: boolean) => Promise<void>;
  disabled: boolean;
  error: string | null;
  setConfirm: (c: Confirm) => void;
  toast: (m: string) => void;
  business: MerchantProfileResponse | null;
  legacyHandlers: LegacyHandlers;
  setHandedOver: (v: boolean) => void;
}

type LegacyHandlers = Omit<React.ComponentProps<typeof OrderCard>, "order" | "bucket">;

function hm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * One order, pushed from the Orders home (fixed parent `/queue`, README "Navigation model"), on the
 * screen its state calls for (packages/design/handoff/merchant-mobile, ledger D-48):
 *
 * - B3 Cooking ticket — the prep ring, the lines, "Food is ready", "Can't finish this order". Dispatch
 *   stays at "Food is ready" (owner decision), so no rider shows here yet.
 * - B4 Handover — the rider, the four-digit pickup code the rider types in their app (owner decision:
 *   today's direction), "✓ Code matches" once they have, then "Hand over". Before a rider accepts it
 *   says so, and a no-rider hold offers "Keep searching" or cancelling.
 * - B6 Tracking — the map, the rider, the eight-step stepper, "Mark ride completed" (after pickup only).
 * - B7 Delivered + cash back — "I got $12.00", or "No cash on this one · mark completed".
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
  // "Hand over" is the merchant's own step after the rider's code matched (B4 → B6).
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
  // B4 stays up once the code matched, until the merchant taps "Hand over".
  if (view === "tracking" && order.status === "picked_up" && !handedOver) view = "handover";
  const disabled = actionsDisabled || busy;
  const confirmSheet = renderConfirm();
  const ctx: Ctx = { order, act, disabled, error, setConfirm, toast, business, legacyHandlers: legacyHandlers(), setHandedOver };

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

// ── B3 ─────────────────────────────────────────────────────────────────────────────────────────
function Cooking({ order, act, disabled, error, setConfirm, legacyHandlers }: Ctx) {
  const now = useNow();
  const startMs = order.prepStartedAt ? new Date(order.prepStartedAt).getTime() : now;
  const totalMs = (order.prepMinutes ?? 15) * 60_000;
  const leftMs = Math.max(0, startMs + totalMs - now);
  const pct = Math.min(100, Math.round(((totalMs - leftMs) / totalMs) * 100));
  const readyBy = hm(new Date(startMs + totalMs).toISOString());
  const wallet = order.paymentMethod === "wallet";
  return (
    <>
      <AppBar back="/queue" title={orderLabel(order)} right={<b className="m-num">{money(order.merchantGoodsTotal)}</b>} />
      <div className="m-bd" style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--accent-wash)", borderRadius: 16, padding: 14 }}>
          <div className="m-ring" style={{ background: `conic-gradient(var(--accent) 0 ${pct}%, #cdeeda ${pct}% 100%)` }}>
            <b>{formatCountdown(leftMs)}</b>
          </div>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 15, display: "block" }}>{leftMs > 0 ? "Cooking" : "Time’s up"}</b>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Ready by {readyBy} · a rider is found when it’s ready</span>
          </div>
        </div>
        <Lines order={order} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5, marginTop: 4 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Icon name="circle-check" size={18} color="var(--accent-text)" />
            Accepted {hm(order.prepStartedAt)}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--muted)" }}>
            <Icon name="clock" size={18} />
            Food is ready
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--muted)" }}>
            <Icon name="bike" size={18} />
            Rider at your counter
          </div>
        </div>
        {error && <div className="m-alert" role="alert">{error}</div>}
        <div style={{ flex: 1 }} />
        <button type="button" className="m-btn" disabled={disabled} onClick={() => void act(() => markReady(order.id), "Marked ready · finding a rider")}>
          Food is ready
        </button>
        {wallet ? (
          // A paid WALLET order is refunded with the merchant's own reference (legacy lane).
          <OrderCard order={order} bucket="preparing" {...legacyHandlers} />
        ) : (
          <button type="button" className="m-lnk m-red" style={{ minHeight: 36, fontSize: 13 }} disabled={disabled} onClick={() => setConfirm("cancel")}>
            Can’t finish this order
          </button>
        )}
      </div>
    </>
  );
}

// ── B4 ─────────────────────────────────────────────────────────────────────────────────────────
function Handover({ order, act, disabled, error, setConfirm, toast, setHandedOver }: Ctx) {
  const matched = isAfterPickup(order);
  const hold = isNoRiderHold(order);
  return (
    <>
      <AppBar back="/queue" title={`${orderLabel(order)} · hand over`} />
      <div className="m-bd" style={{ flex: 1 }}>
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
        <div className="m-card" style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Order total</span>
          <b className="m-num" style={{ fontSize: 22 }}>
            {money(order.merchantGoodsTotal)}
          </b>
        </div>
        {error && <div className="m-alert" role="alert">{error}</div>}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="m-btn"
          disabled={!matched}
          onClick={() => {
            setHandedOver(true);
            toast("Handed over · tracking the delivery");
          }}
        >
          Hand over
        </button>
      </div>
    </>
  );
}

// ── B6 ─────────────────────────────────────────────────────────────────────────────────────────
function Tracking({ order, disabled, error, setConfirm, business }: Ctx) {
  return (
    <>
      <StaticMap center={business?.location?.point ?? null} height={170}>
        <Link href="/queue" className="m-gh" aria-label="Back" style={{ position: "absolute", top: "calc(12px + env(safe-area-inset-top))", left: 12, width: 44, padding: 0, borderRadius: "50%" }}>
          <Icon name="chevron-left" size={20} />
        </Link>
      </StaticMap>
      <div style={{ flex: 1, marginTop: -20, background: "var(--bg)", borderRadius: "20px 20px 0 0", position: "relative", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <b style={{ fontSize: 18 }}>{orderLabel(order)} on the way</b>
          <div className="m-hint" style={{ fontSize: 13, marginTop: 2 }}>
            {order.items.length} item{order.items.length === 1 ? "" : "s"} · {money(order.merchantGoodsTotal)}
          </div>
        </div>
        {order.rider && <RiderRow order={order} />}
        <Stepper steps={steps(order)} />
        {error && <div className="m-alert" role="alert">{error}</div>}
        <button type="button" className="m-lnk" style={{ minHeight: 32, fontSize: 13, marginTop: "auto" }} disabled={disabled} onClick={() => setConfirm("force")}>
          Mark ride completed
        </button>
      </div>
    </>
  );
}

// ── B7 ─────────────────────────────────────────────────────────────────────────────────────────
function Delivered({ order, act, disabled, error, setConfirm }: Ctx) {
  const now = useNow(30_000);
  const [showSteps, setShowSteps] = useState(false);
  const delivered = order.status === "delivered" || order.status === "completed";
  const amount = order.debtAmount ?? order.merchantGoodsTotal ?? 0;
  const dueMin = order.cashDueAt ? Math.round((new Date(order.cashDueAt).getTime() - now) / 60_000) : null;
  const all = steps(order);
  const done = all.filter((s) => s.state === "done").length;
  const rider = riderFirstName(order) ?? "The rider";
  return (
    <>
      <AppBar back="/queue" title={orderLabel(order)} />
      <div className="m-bd">
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: delivered ? "var(--accent-wash)" : "var(--highlight-wash)", borderRadius: 16, padding: 14 }}>
          <Icon name={delivered ? "circle-check" : "circle-alert"} size={32} color={delivered ? "var(--accent-text)" : "var(--highlight-ink)"} />
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 16, display: "block" }}>{delivered ? `Delivered ${hm(order.deliveredAt)}` : "Not delivered"}</b>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{delivered ? "Buyer confirmed with the code" : "The rider brings the food back to you"}</span>
          </div>
        </div>

        {delivered ? (
          <div className="m-card" style={{ border: "2px solid var(--highlight)", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "var(--highlight-ink)" }}>CASH BACK TO YOU</span>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14 }}>{rider} is bringing</span>
              <b className="m-num" style={{ fontSize: 24 }}>
                {money(amount)}
              </b>
            </div>
            {order.cashDueAt && dueMin !== null && (
              <span className="m-hint" style={dueMin < 0 ? { color: "var(--danger-ink)" } : undefined}>
                Due by {hm(order.cashDueAt)} · {dueMin < 0 ? `${-dueMin} min overdue` : `${dueMin} min left`}
              </span>
            )}
            {error && <div className="m-alert" role="alert">{error}</div>}
            <button type="button" className="m-btn m-sm" disabled={disabled} onClick={() => void act(() => confirmReturnedCash(order.id, amount), "Cash confirmed · order closed", true)}>
              I got {money(amount)}
            </button>
            <button type="button" className="m-gh" style={{ minHeight: 40, fontSize: 13.5 }} disabled={disabled} onClick={() => setConfirm("no_cash")}>
              No cash on this one · mark completed
            </button>
          </div>
        ) : (
          <div className="m-card" style={{ border: "2px solid var(--highlight)", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "var(--highlight-ink)" }}>FOOD BACK TO YOU</span>
            <span style={{ fontSize: 14 }}>{rider} is bringing the order back.</span>
            {error && <div className="m-alert" role="alert">{error}</div>}
            <button type="button" className="m-btn m-sm" disabled={disabled} onClick={() => void act(() => confirmGoodsReturned(order.id), "Food back · order closed", true)}>
              I got the food back
            </button>
            <button type="button" className="m-gh" style={{ minHeight: 40, fontSize: 13.5, color: "var(--danger-ink)" }} disabled={disabled} onClick={() => setConfirm("not_returned")}>
              It wasn’t returned
            </button>
          </div>
        )}

        <button type="button" className="m-li" style={{ border: "1px solid var(--line)", borderRadius: 14, padding: "0 14px" }} aria-expanded={showSteps} onClick={() => setShowSteps((s) => !s)}>
          <Icon name="circle-check" size={18} color="var(--accent-text)" />
          <div className="m-t">
            <b>
              {done} of {all.length} steps done
            </b>
            <span>
              Accepted {hm(order.prepStartedAt)}
              {order.deliveredAt ? ` · delivered ${hm(order.deliveredAt)}` : ""}
            </span>
          </div>
          <Icon name={showSteps ? "chevron-up" : "chevron-right"} size={18} color="var(--muted)" />
        </button>
        {showSteps && <Stepper steps={all} />}
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

// ── Shared pieces ──────────────────────────────────────────────────────────────────────────────
function Lines({ order }: Pick<Ctx, "order">) {
  return (
    <div className="m-card" style={{ gap: 0, padding: "4px 14px" }}>
      {order.items.map((item, i) => (
        <div key={`${item.dishId ?? "i"}-${i}`} className="m-li" style={{ cursor: "default" }}>
          <b style={{ width: 26 }}>{item.quantity}×</b>
          <div className="m-t">
            <b>{item.name}</b>
            {item.note && <span style={{ color: "var(--highlight-ink)" }}>“{item.note}”</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function RiderRow({ order }: Pick<Ctx, "order">) {
  const r = order.rider!;
  const name = riderFirstName(order) ?? r.firstName;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="m-av" style={{ background: "var(--accent-wash)", color: "var(--accent-text)" }}>
        {r.firstName.charAt(0)}
      </div>
      <div style={{ flex: 1 }}>
        <b style={{ fontSize: 15 }}>{name}</b>
        <div className="m-hint" style={{ fontSize: 13 }}>
          {[r.plate, r.ratingCount > 0 ? `★ ${r.ratingAvg.toFixed(1)}` : null].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
}

function PickupCode({ order, matched }: Pick<Ctx, "order"> & { matched: boolean }) {
  // Revealing rotates the code (N-16), so it is asked for once per rider, never on every render.
  const [code, setCode] = useState<string | null>(null);
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!order.riderId || matched || askedFor.current === order.riderId) return;
    askedFor.current = order.riderId;
    revealPickupCode(order.id)
      .then((res) => setCode(res.pickupCode))
      .catch(() => setCode(null));
  }, [matched]);
  const digits = (code ?? "").padEnd(4, " ").slice(0, 4).split("");
  return (
    <div className="m-fld">
      <span className="m-label">Rider’s pickup code</span>
      <div className="m-code" aria-label={code ? `Pickup code ${code.split("").join(" ")}` : "No pickup code yet"}>
        {digits.map((d, i) => (
          <span key={i}>{d.trim()}</span>
        ))}
      </div>
      {matched ? (
        <span className="m-hint" style={{ color: "var(--accent-text)", fontWeight: 600 }}>
          ✓ Code matches
        </span>
      ) : (
        order.riderId && <span className="m-hint">The rider types this code in their app</span>
      )}
    </div>
  );
}
