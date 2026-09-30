"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { MerchantBookingOffer, MerchantBookingResponse, MerchantProfileResponse } from "@lynia/shared";
import { Icon } from "../../../components/icons";
import { Kitchen } from "../../../components/Kitchen";
import { useKitchenConnection } from "../../../components/KitchenConnectionProvider";
import { AppBar } from "../../../components/m/AppBar";
import { ConfirmSheet } from "../../../components/m/ConfirmSheet";
import { StaticMap } from "../../../components/m/StaticMap";
import { Stepper } from "../../../components/m/Stepper";
import { useToast } from "../../../components/m/Toast";
import { RetryableError } from "../../../components/RetryableError";
import { ApiError, redirectIfSessionExpired } from "../../../lib/api-client";
import { startFare, stepFare } from "../../../lib/book-form";
import { codeMessage, isFinding, newIdempotencyKey, pollIntervalMs, recallCode, rememberCode, undeliveredText, whatsappLink } from "../../../lib/booking";
import { bookingSteps, fareDelta, type OfferSort, shortName, sortOffers } from "../../../lib/booking-view";
import { cancelBooking, closeBookingCash, getBooking, pickOffer, retryBooking, rotateBookingCode } from "../../../lib/bookings-api";
import { useBusiness } from "../../../lib/business";
import { supportWhatsAppUrl } from "../../../lib/config";
import { formatCountdown, msUntil } from "../../../lib/countdown";
import { money } from "../../../lib/orders-view";
import { useNow } from "../../../lib/use-now";

type LoadState = { status: "loading" } | { status: "ready"; booking: MerchantBookingResponse } | { status: "error"; message: string };

interface Ctx {
  booking: MerchantBookingResponse;
  business: MerchantProfileResponse | null;
  busy: string | null;
  disabled: boolean;
  error: string | null;
  code: string | null;
  onPick: (o: MerchantBookingOffer) => void;
  onNewCode: () => void;
  onCancel: () => void;
  onRetry: (fare: number) => void;
  /** D7: "I got $X" straight away; "No cash on this one" asks first. */
  onCashReturned: () => void;
  onNoCash: () => void;
}

/**
 * One booking (packages/design/handoff/merchant-mobile, ledger D-48): D4 · Pick a rider while riders
 * offer (a gold countdown, sort chips, the business's own rider on top); D5 · Tracking once one has it
 * (a map, the rider, the **buyer's code** to send them, the stepper); D7 · Delivered at the end; and the
 * other endings (not delivered, cancelled, nobody picked) with a way to go again. Polls (3 s while
 * finding a rider, 15 s after). The code comes back once, at the pick, and this browser keeps it; any
 * teammate can get a new code, which replaces it.
 */
export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { signOut, actionsDisabled } = useKitchenConnection();
  const business = useBusiness();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmNoCash, setConfirmNoCash] = useState(false);
  const actingRef = useRef(false);
  const retryKey = useRef(newIdempotencyKey());
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState({ status: "loading" });
      try {
        setState({ status: "ready", booking: await getBooking(id) });
      } catch (err) {
        if (redirectIfSessionExpired(err, signOutRef.current)) return;
        if (!quiet) setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load this booking." });
      }
    },
    [id],
  );

  useEffect(() => {
    setCode(recallCode(id));
    void load();
  }, [id, load]);

  const booking = state.status === "ready" ? state.booking : null;
  const interval = booking ? pollIntervalMs(booking.state) : null;
  useEffect(() => {
    if (!interval) return undefined;
    const t = setInterval(() => void load(true), interval);
    return () => clearInterval(t);
  }, [interval, load]);

  /** One action at a time; a refused one refetches, since the booking moved under us. */
  async function act<T>(name: string, run: () => Promise<T>, done: (value: T) => void) {
    if (actingRef.current) return;
    actingRef.current = true;
    setBusy(name);
    setError(null);
    try {
      done(await run());
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
      void load(true);
    } finally {
      setBusy(null);
      actingRef.current = false;
    }
  }

  const shop = business?.businessType === "shop";
  const ctx: Ctx | null = booking && {
    booking,
    business,
    busy,
    disabled: actionsDisabled || busy !== null,
    error,
    code,
    onPick: (o) =>
      void act("pick", () => pickOffer(id, o.id), (res) => {
        rememberCode(id, res.deliveryCode);
        setCode(res.deliveryCode);
        setState({ status: "ready", booking: res.booking });
        toast(`${shortName(o.rider.name) ?? "Your rider"} is on the way`);
      }),
    onNewCode: () =>
      void act("code", () => rotateBookingCode(id), (res) => {
        rememberCode(id, res.deliveryCode);
        setCode(res.deliveryCode);
        toast("New code · the old one stops working");
      }),
    onCancel: () => setConfirmCancel(true),
    onRetry: (fare) => void act("retry", () => retryBooking(id, { proposedFare: fare, idempotencyKey: retryKey.current }), (b) => router.replace(`/deliveries/${b.id}`)),
    onCashReturned: () =>
      void act("cash", () => closeBookingCash(id, "returned"), (b) => {
        setState({ status: "ready", booking: b });
        toast("Cash confirmed · delivery closed");
      }),
    onNoCash: () => setConfirmNoCash(true),
  };

  return (
    <Kitchen active={shop ? "deliveries" : "queue"} tabs={false}>
      <div className="m-page">
        {!ctx && (
          <>
            <AppBar back="/deliveries" title="Delivery" />
            <div className="m-bd">
              {state.status === "loading" && <div className="m-hint">Loading the booking…</div>}
              {state.status === "error" && <RetryableError message={state.message} onRetry={() => void load()} />}
            </div>
          </>
        )}
        {ctx && isFinding(ctx.booking.state) && <Offers {...ctx} />}
        {ctx && (ctx.booking.state === "coming" || ctx.booking.state === "picked_up") && <Tracking {...ctx} />}
        {ctx && ctx.booking.state === "delivered" && <Delivered {...ctx} />}
        {ctx && (ctx.booking.state === "not_delivered" || ctx.booking.state === "cancelled" || ctx.booking.state === "expired") && <Ended {...ctx} />}
      </div>

      {confirmNoCash && booking && (
        <ConfirmSheet
          title="Close without cash?"
          body="Nothing will show as owed for this delivery."
          confirmLabel="Close delivery"
          danger={false}
          busy={busy === "cash"}
          error={error}
          onConfirm={() =>
            void act("cash", () => closeBookingCash(id, "no_cash"), (b) => {
              setConfirmNoCash(false);
              setState({ status: "ready", booking: b });
              toast("Completed · no cash expected");
            })
          }
          onCancel={() => setConfirmNoCash(false)}
        />
      )}

      {confirmCancel && booking && (
        <ConfirmSheet
          title="Cancel this booking?"
          body="The rider is told. You can book again any time."
          confirmLabel="Cancel booking"
          busy={busy === "cancel"}
          error={error}
          onConfirm={() =>
            void act("cancel", () => cancelBooking(id), (b) => {
              setConfirmCancel(false);
              setState({ status: "ready", booking: b });
              toast("Booking cancelled");
            })
          }
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </Kitchen>
  );
}

// ── D4 · Pick a rider ─────────────────────────────────────────────────────────────────────────
function Offers({ booking, disabled, busy, error, onPick, onCancel }: Ctx) {
  const now = useNow(1000);
  const [sort, setSort] = useState<OfferSort>("best");
  const left = msUntil(booking.expiresAt, now);
  const offers = sortOffers(booking.offers, sort);
  return (
    <>
      <AppBar
        back="/deliveries"
        title="Pick a rider"
        right={
          booking.expiresAt ? (
            <span className={`m-pl m-num ${left < 20_000 ? "m-red" : "m-gold"}`} style={{ height: 32, fontSize: 15, padding: "0 12px" }}>
              {formatCountdown(left)}
            </span>
          ) : undefined
        }
      />
      <div className="m-bd">
        <p className="m-sub">
          {booking.state === "finding_again" ? "Your rider cancelled, so LyniaGo sent it out again. " : ""}
          {booking.itemsSummary} → {booking.dropoff.landmark} · you offered <b style={{ color: "var(--ink)" }}>{money(Number(booking.proposedFare))}</b>
        </p>
        <div className="m-chips" role="tablist" aria-label="Sort offers">
          {(
            [
              ["best", "Best match"],
              ["cheapest", "Cheapest"],
              ["closest", "Closest"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={sort === value} className={`m-chip${sort === value ? " m-on" : ""}`} onClick={() => setSort(value)}>
              {label}
            </button>
          ))}
        </div>
        {error && (
          <div className="m-alert" role="alert">
            {error}
          </div>
        )}
        {offers.length === 0 && <div className="m-hint">Waiting for riders&apos; offers…</div>}
        {offers.map((o, i) => {
          const name = shortName(o.rider.name) ?? o.rider.name;
          const first = o.preferred || (i === 0 && !o.ownMember && sort === "best" && !offers.some((x) => x.preferred));
          const delta = fareDelta(o.offeredFare, booking.proposedFare);
          return (
            <div key={o.id} className={`m-card m-offer${o.preferred ? " m-pref" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className={`m-av${o.preferred ? " m-av-on" : ""}`}>{name.charAt(0).toUpperCase()}</span>
                <div className="m-t" style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 15.5, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {name}
                    {o.preferred && <span className="m-pl m-wal">Preferred rider</span>}
                  </b>
                  <span className="m-hint m-num" style={{ fontSize: 13 }}>
                    {o.rider.ratingAvg != null ? `★ ${o.rider.ratingAvg.toFixed(1)} · ` : ""}
                    {o.rider.tripsCount} trips · {o.etaMinutes} min away
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <b className="m-num" style={{ fontSize: 20 }}>
                    {money(Number(o.offeredFare))}
                  </b>
                  {delta && (
                    <span className="m-num" style={{ display: "block", fontSize: 12, fontWeight: 700, color: delta.less ? "var(--accent-text)" : "var(--muted)" }}>
                      {delta.text}
                    </span>
                  )}
                </div>
              </div>
              {o.ownMember ? (
                <span className="m-hint" style={{ color: "var(--highlight-ink)" }}>
                  On your team, so they can&apos;t take your own delivery.
                </span>
              ) : (
                <button type="button" className={first ? "m-btn" : "m-gh"} disabled={disabled} onClick={() => onPick(o)}>
                  {busy === "pick" ? "Picking…" : `Pick ${o.rider.name.split(/\s+/)[0]}`}
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className="m-lnk m-red" disabled={disabled} onClick={onCancel}>
          Cancel booking
        </button>
      </div>
    </>
  );
}

// ── D5 · Tracking ─────────────────────────────────────────────────────────────────────────────
function Tracking({ booking, business, disabled, error, code, onNewCode, onCancel }: Ctx) {
  const rider = booking.rider;
  const message = code ? codeMessage({ businessName: business?.name ?? "your shop", riderName: rider?.name ?? null, bikeReg: rider?.bikeReg ?? null, code }) : "";
  const wa = code ? whatsappLink(booking.dropoff.contactPhone, message) : null;
  const help = supportWhatsAppUrl();
  return (
    <>
      <StaticMap center={business?.location?.point ?? null} height={150}>
        <Link href="/deliveries" className="m-gh" aria-label="Back" style={{ position: "absolute", top: "calc(12px + env(safe-area-inset-top))", left: 12, width: 44, padding: 0, borderRadius: "50%" }}>
          <Icon name="chevron-left" size={20} />
        </Link>
      </StaticMap>
      <div className="m-over">
        <div>
          <b style={{ fontSize: 18 }}>{booking.state === "picked_up" ? "On the way to buyer" : "Rider coming to your shop"}</b>
          <div className="m-hint" style={{ fontSize: 13, marginTop: 2 }}>
            {booking.itemsSummary}
          </div>
        </div>
        {rider && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="m-av m-av-on">{rider.name.charAt(0).toUpperCase()}</span>
            <div className="m-t" style={{ flex: 1 }}>
              <b style={{ display: "block", fontSize: 15 }}>{shortName(rider.name)}</b>
              <span className="m-hint">{rider.bikeReg ?? "LyniaGo rider"}</span>
            </div>
            {rider.phone && (
              <a href={`tel:${rider.phone}`} className="m-gh" aria-label={`Call ${shortName(rider.name)}`} style={{ width: 44, padding: 0, borderRadius: "50%" }}>
                <Icon name="phone" size={18} />
              </a>
            )}
          </div>
        )}
        <div className="m-codecard">
          <div style={{ flex: 1 }}>
            <span className="m-label" style={{ letterSpacing: ".06em", color: "var(--muted)" }}>
              BUYER’S CODE
            </span>
            {code ? (
              <b className="m-num" aria-label={`Buyer's code ${code.split("").join(" ")}`}>
                {code.replace(/(\d{3})(?=\d)/g, "$1 ")}
              </b>
            ) : (
              <span className="m-hint" style={{ display: "block" }}>
                Shown to whoever picked the rider.
              </span>
            )}
          </div>
          {wa ? (
            <a className="m-gh" href={wa} target="_blank" rel="noreferrer">
              Send to buyer
            </a>
          ) : (
            <button type="button" className="m-gh" disabled={disabled} onClick={onNewCode}>
              Get a new code
            </button>
          )}
        </div>
        {code && (
          <button type="button" className="m-lnk m-muted" style={{ minHeight: 32, fontSize: 13, alignSelf: "flex-start" }} disabled={disabled} onClick={onNewCode}>
            Get a new code
          </button>
        )}
        <Stepper steps={bookingSteps(booking)} />
        {error && (
          <div className="m-alert" role="alert">
            {error}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto" }}>
          {booking.state === "coming" ? (
            <button type="button" className="m-lnk m-red" disabled={disabled} onClick={onCancel}>
              Cancel booking
            </button>
          ) : (
            help && (
              <a className="m-lnk" href={help} target="_blank" rel="noreferrer">
                Help
              </a>
            )
          )}
        </div>
      </div>
    </>
  );
}

// ── D7 · Delivered ────────────────────────────────────────────────────────────────────────────
function Delivered({ booking, busy, disabled, error, onCashReturned, onNoCash }: Ctx) {
  const now = useNow(30_000);
  const [showSteps, setShowSteps] = useState(false);
  const steps = bookingSteps(booking);
  const done = steps.filter((st) => st.state === "done").length;
  const rider = shortName(booking.rider?.name);
  const cod = booking.cashOnDelivery ?? null;
  const dueMin = cod?.dueAt ? Math.round((new Date(cod.dueAt).getTime() - now) / 60_000) : null;
  return (
    <>
      <AppBar back="/deliveries" title="Delivery" />
      <div className="m-bd">
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--accent-wash)", borderRadius: 16, padding: 14 }}>
          <Icon name="circle-check" size={32} color="var(--accent-text)" />
          <div>
            <b style={{ fontSize: 16, display: "block" }}>Delivered</b>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Buyer gave the rider the code</span>
          </div>
        </div>
        {cod?.status === "due" && (
          <div className="m-card" style={{ border: "2px solid var(--highlight)", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "var(--highlight-ink)" }}>CASH BACK TO YOU</span>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14 }}>{rider ?? "The rider"} is bringing</span>
              <b className="m-num" style={{ fontSize: 24 }}>
                {money(Number(cod.amount))}
              </b>
            </div>
            {cod.dueAt && dueMin !== null && (
              <span className="m-hint" style={dueMin < 0 ? { color: "var(--danger-ink)" } : undefined}>
                Due by {new Date(cod.dueAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {dueMin < 0 ? `${-dueMin} min overdue` : `${dueMin} min left`}
              </span>
            )}
            {error && (
              <div className="m-alert" role="alert">
                {error}
              </div>
            )}
            <button type="button" className="m-btn m-sm" disabled={disabled} onClick={onCashReturned}>
              {busy === "cash" ? "Saving…" : `I got ${money(Number(cod.amount))}`}
            </button>
            <button type="button" className="m-gh" disabled={disabled} onClick={onNoCash}>
              No cash on this one · mark completed
            </button>
          </div>
        )}
        <button type="button" className="m-card" style={{ flexDirection: "row", alignItems: "center", cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }} onClick={() => setShowSteps((v) => !v)}>
          <Icon name="circle-check" size={20} color="var(--accent-text)" />
          <div style={{ flex: 1 }}>
            <b style={{ display: "block", fontSize: 15 }}>
              {done} of {steps.length} steps done
            </b>
            <span className="m-hint">Booked {steps[0]!.time}</span>
          </div>
          <Icon name={showSteps ? "chevron-up" : "chevron-right"} size={18} color="var(--muted)" />
        </button>
        {showSteps && <Stepper steps={steps} />}
        <div className="m-card" style={{ padding: "0 14px", gap: 0 }}>
          {booking.itemsSummary.split(" · ").map((line) => {
            const m = /^(\d+)× (.+)$/.exec(line);
            return (
              <div key={line} className="m-li">
                <b className="m-num" style={{ width: 28 }}>
                  {m ? `${m[1]}×` : "1×"}
                </b>
                <div className="m-t">
                  <b>{m ? m[2] : line}</b>
                </div>
              </div>
            );
          })}
          <div className="m-li">
            <div className="m-t">
              <b>Fare{rider ? ` to ${rider}` : ""}</b>
            </div>
            <b className="m-num">{money(Number(booking.agreedFare ?? booking.proposedFare))}</b>
          </div>
        </div>
        <Link href="/deliveries/new" className="m-lnk" style={{ marginTop: 8 }}>
          Book again
        </Link>
      </div>
    </>
  );
}

// ── Not delivered · cancelled · nobody picked ─────────────────────────────────────────────────
function Ended({ booking, disabled, busy, error, onRetry }: Ctx) {
  const [fare, setFare] = useState(() => startFare(Number(booking.proposedFare)));
  const help = supportWhatsAppUrl();
  // Nobody picked in time, the business cancelled, or a rider cancelled and Send couldn't re-send it. A
  // cancel by the LyniaGo team (a safety concern) is not offered again.
  const canRetry =
    booking.state === "expired" || (booking.state === "cancelled" && (booking.cancelledBy === "business" || (booking.cancelledBy === "rider" && !booking.rebroadcastedToId)));
  const title =
    booking.state === "not_delivered"
      ? "Not delivered"
      : booking.state === "expired"
        ? "No rider picked in time"
        : booking.cancelledBy === "rider"
          ? "Your rider cancelled"
          : booking.cancelledBy === "business"
            ? "Booking cancelled"
            : "Cancelled by the LyniaGo team";
  return (
    <>
      <AppBar back="/deliveries" title="Delivery" />
      <div className="m-bd">
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--highlight-wash)", borderRadius: 16, padding: 14 }}>
          <Icon name="circle-alert" size={32} color="var(--highlight-ink)" />
          <div>
            <b style={{ fontSize: 16, display: "block" }}>{title}</b>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {booking.state === "not_delivered"
                ? `${undeliveredText(booking.undeliveredReason)} Call the rider to get the goods back.`
                : booking.state === "cancelled" && booking.cancelledBy === "ops"
                  ? (booking.cancelReason ?? "")
                  : `${booking.itemsSummary} → ${booking.dropoff.landmark}`}
            </span>
          </div>
        </div>
        {booking.state === "not_delivered" && booking.rider?.phone && (
          <a href={`tel:${booking.rider.phone}`} className="m-gh">
            <Icon name="phone" size={18} /> Call {shortName(booking.rider.name)}
          </a>
        )}
        {booking.rebroadcastedToId && (
          <Link href={`/deliveries/${booking.rebroadcastedToId}`} className="m-btn">
            LyniaGo sent it out again · follow it
          </Link>
        )}
        {error && (
          <div className="m-alert" role="alert">
            {error}
          </div>
        )}
        {canRetry && (
          <>
            <div className="m-fld">
              <span className="m-label">Fare you offer</span>
              <div className="m-card m-fare">
                <button type="button" aria-label="Offer $0.50 less" disabled={fare <= 1.5} onClick={() => setFare((f) => stepFare(f, -1))}>
                  <Icon name="minus" size={20} />
                </button>
                <div>
                  <b className="m-num">{money(fare)}</b>
                  {booking.state === "expired" && <span>Raise it if riders didn&apos;t bite</span>}
                </div>
                <button type="button" aria-label="Offer $0.50 more" onClick={() => setFare((f) => stepFare(f, 1))}>
                  <Icon name="plus" size={20} />
                </button>
              </div>
            </div>
            <button type="button" className="m-btn" disabled={disabled} onClick={() => onRetry(fare)}>
              {busy === "retry" ? "Sending…" : `Try again · ${money(fare)}`}
            </button>
          </>
        )}
        {!canRetry && help && (
          <a className="m-lnk" href={help} target="_blank" rel="noreferrer">
            Message LyniaGo
          </a>
        )}
      </div>
    </>
  );
}
