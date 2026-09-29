"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { MerchantBookingOffer, MerchantBookingResponse } from "@lynia/shared";
import { money, timeOf } from "../../../components/bookings/BookingParts";
import { Kitchen } from "../../../components/Kitchen";
import { useKitchenConnection } from "../../../components/KitchenConnectionProvider";
import { Icon } from "../../../components/icons";
import { RetryableError } from "../../../components/RetryableError";
import { cardStyle, dangerGhostButtonStyle, disabledStyle, ghostButtonStyle, primaryButtonStyle } from "../../../components/queue/styles";
import { ApiError, redirectIfSessionExpired } from "../../../lib/api-client";
import {
  codeMessage,
  isFinding,
  newIdempotencyKey,
  pollIntervalMs,
  recallCode,
  rememberCode,
  STATE_LABEL,
  undeliveredText,
  whatsappLink,
} from "../../../lib/booking";
import { cancelBooking, getBooking, pickOffer, retryBooking, rotateBookingCode } from "../../../lib/bookings-api";
import { useBusiness } from "../../../lib/business";
import { supportWhatsAppUrl } from "../../../lib/config";
import { formatCountdown, msUntil } from "../../../lib/countdown";
import { formatMoney, parseAmountInput } from "../../../lib/money-input";
import { useNow } from "../../../lib/use-now";

type LoadState = { status: "loading" } | { status: "ready"; booking: MerchantBookingResponse } | { status: "error"; message: string };

/**
 * One booking (merchant web upgrade L2): the pick screen while riders offer, then the delivery code and
 * the rider, then how it ended. Polls (3 s while finding a rider, 15 s after), and a return to the page
 * refetches. The code comes back once, at the pick, and this browser keeps it; any teammate can "Send a
 * new code", which replaces it. Undrawn, ledgered as D-44.
 */
export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { signOut, actionsDisabled } = useKitchenConnection();
  const business = useBusiness();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [retryFare, setRetryFare] = useState("");
  const [copied, setCopied] = useState(false);
  const actingRef = useRef(false);
  const retryKey = useRef(newIdempotencyKey());
  // Try again starts from the booking's own fare, once: a booker clearing the box to type isn't refilled.
  const retryFareSeeded = useRef(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState({ status: "loading" });
      try {
        const booking = await getBooking(id);
        setState({ status: "ready", booking });
      } catch (err) {
        if (redirectIfSessionExpired(err, signOut)) return;
        if (!quiet) setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load this booking." });
      }
    },
    [id, signOut],
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

  useEffect(() => {
    if (!booking || retryFareSeeded.current) return;
    retryFareSeeded.current = true;
    setRetryFare(formatMoney(Number(booking.proposedFare)));
  }, [booking]);

  const finding = booking ? isFinding(booking.state) : false;
  const now = useNow(1000, finding);

  /** One action at a time; a refused one refetches, since the booking moved under us. */
  async function act<T>(name: string, run: () => Promise<T>, done: (value: T) => void) {
    if (actingRef.current) return;
    actingRef.current = true;
    setBusy(name);
    setActionError(null);
    try {
      done(await run());
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setActionError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
      void load(true);
    } finally {
      setBusy(null);
      actingRef.current = false;
    }
  }

  function pick(offer: MerchantBookingOffer) {
    void act("pick", () => pickOffer(id, offer.id), (res) => {
      rememberCode(id, res.deliveryCode);
      setCode(res.deliveryCode);
      setState({ status: "ready", booking: res.booking });
    });
  }

  function newCode() {
    void act("code", () => rotateBookingCode(id), (res) => {
      rememberCode(id, res.deliveryCode);
      setCode(res.deliveryCode);
      setCopied(false);
    });
  }

  function cancel() {
    void act("cancel", () => cancelBooking(id), (b) => {
      setConfirmCancel(false);
      setState({ status: "ready", booking: b });
    });
  }

  function retry() {
    const fare = parseAmountInput(retryFare);
    if (fare === null) {
      setActionError("Enter the fare in dollars, like 3.50.");
      return;
    }
    void act("retry", () => retryBooking(id, { proposedFare: fare, idempotencyKey: retryKey.current }), (b) => router.replace(`/deliveries/${b.id}`));
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const shop = business?.businessType === "shop";
  const disabled = actionsDisabled || busy !== null;
  const help = supportWhatsAppUrl();
  // Nobody picked in time, the business cancelled, or a rider cancelled and Send couldn't re-send it. A
  // cancel by the LyniaGo team (a safety concern) is not offered again.
  const canRetry =
    !!booking &&
    (booking.state === "expired" ||
      (booking.state === "cancelled" && (booking.cancelledBy === "business" || (booking.cancelledBy === "rider" && !booking.rebroadcastedToId))));

  return (
    <Kitchen active={shop ? "deliveries" : "queue"}>
      <div className="kitchen-page" style={{ overflow: "auto", height: "100%" }}>
        <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}>
          <Link href="/deliveries" style={backLink}>
            <Icon name="chevron-left" size={16} /> Deliveries
          </Link>

          {state.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading the booking…</div>}
          {state.status === "error" && <RetryableError message={state.message} onRetry={() => void load()} />}

          {booking && (
            <>
              <div>
                {/* The state is the title; the list's pill would only repeat it here. */}
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>{STATE_LABEL[booking.state]}</div>
                <div style={{ fontSize: 13.5, color: "var(--ink)", marginTop: 6 }}>
                  <b>{booking.itemsSummary}</b> to {booking.dropoff.landmark}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                  Worth {money(booking.declaredValue)} · {booking.bookedBy ? `Booked by ${booking.bookedBy} at ` : "Booked at "}
                  {timeOf(booking.createdAt)}
                </div>
              </div>

              {actionError && (
                <div role="alert" style={bannerStyle}>
                  {actionError}
                </div>
              )}

              {finding && (
                <FindingPanel
                  booking={booking}
                  left={msUntil(booking.expiresAt, now)}
                  disabled={disabled}
                  picking={busy === "pick"}
                  onPick={pick}
                />
              )}

              {(booking.state === "coming" || booking.state === "picked_up") && (
                <>
                  <CodeCard
                    code={code}
                    buyerPhone={booking.dropoff.contactPhone}
                    message={code ? codeMessage({ businessName: business?.name ?? "your shop", riderName: booking.rider?.name ?? null, bikeReg: booking.rider?.bikeReg ?? null, code }) : ""}
                    copied={copied}
                    onCopy={() => void copyCode()}
                    onNewCode={newCode}
                    rotating={busy === "code"}
                    disabled={disabled}
                  />
                  {booking.rider && <RiderCard rider={booking.rider} fare={booking.agreedFare ?? booking.proposedFare} />}
                </>
              )}

              {booking.state === "picked_up" && (
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                  The rider has it now, so this booking can't be cancelled here. Call the rider
                  {help ? (
                    <>
                      , or{" "}
                      <a href={help} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)", fontWeight: 700 }}>
                        message LyniaGo
                      </a>
                    </>
                  ) : null}
                  .
                </div>
              )}

              {booking.state === "delivered" && (
                <div style={{ ...cardStyle, display: "flex", gap: 12, alignItems: "center" }}>
                  <Icon name="circle-check" size={22} color="var(--accent-text)" />
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                    The buyer gave the rider the code. {booking.rider ? `${booking.rider.name} was paid ${money(booking.agreedFare)} at pickup.` : ""}
                  </div>
                </div>
              )}

              {booking.state === "not_delivered" && (
                <div style={{ ...cardStyle, fontSize: 14, lineHeight: 1.5 }}>
                  <b>{undeliveredText(booking.undeliveredReason)}</b> Call the rider to arrange getting the goods back.
                  {booking.rider?.phone && (
                    <div style={{ marginTop: 10 }}>
                      <a href={`tel:${booking.rider.phone}`} style={{ ...ghostButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Icon name="phone" size={16} /> Call rider
                      </a>
                    </div>
                  )}
                </div>
              )}

              {booking.state === "cancelled" && (
                <div style={{ ...cardStyle, fontSize: 14, lineHeight: 1.5 }}>
                  {booking.cancelledBy === "rider" ? (
                    <>
                      <b>Your rider cancelled.</b>{" "}
                      {booking.rebroadcastedToId ? (
                        <>
                          LyniaGo sent it out again.{" "}
                          <Link href={`/deliveries/${booking.rebroadcastedToId}`} style={{ color: "var(--accent-text)", fontWeight: 700 }}>
                            Follow the new booking
                          </Link>
                        </>
                      ) : null}
                    </>
                  ) : booking.cancelledBy === "business" ? (
                    <b>This booking was cancelled.</b>
                  ) : (
                    <>
                      <b>Cancelled by the LyniaGo team.</b> {booking.cancelReason ?? ""}
                    </>
                  )}
                </div>
              )}

              {canRetry && (
                <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                    {booking.state === "expired"
                      ? "Nobody was picked in time. Send it again, and raise the fare if riders didn't bite."
                      : "Send the same delivery again."}
                  </div>
                  <label htmlFor="retry-fare" style={{ fontSize: 13, fontWeight: 700 }}>
                    Fare you offer (US$)
                  </label>
                  <input id="retry-fare" inputMode="decimal" value={retryFare} onChange={(e) => setRetryFare(e.target.value)} style={inputStyle} />
                  <button type="button" onClick={retry} disabled={disabled} style={{ ...primaryButtonStyle, ...disabledStyle(disabled) }}>
                    {busy === "retry" ? "Sending…" : "Try again"}
                  </button>
                </div>
              )}

              {(finding || booking.state === "coming") &&
                (confirmCancel ? (
                  <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                      <b>Cancel this booking?</b> {booking.state === "coming" ? "There's no charge before pickup." : ""}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button type="button" onClick={cancel} disabled={disabled} style={{ ...dangerGhostButtonStyle, ...disabledStyle(disabled) }}>
                        {busy === "cancel" ? "Cancelling…" : "Yes, cancel"}
                      </button>
                      <button type="button" onClick={() => setConfirmCancel(false)} style={ghostButtonStyle}>
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmCancel(true)} disabled={disabled} style={{ ...dangerGhostButtonStyle, alignSelf: "flex-start", ...disabledStyle(disabled) }}>
                    Cancel booking
                  </button>
                ))}
            </>
          )}
        </div>
      </div>
    </Kitchen>
  );
}

function FindingPanel({
  booking,
  left,
  disabled,
  picking,
  onPick,
}: {
  booking: MerchantBookingResponse;
  left: number;
  disabled: boolean;
  picking: boolean;
  onPick: (offer: MerchantBookingOffer) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: left < 20_000 ? "var(--danger-ink)" : "var(--ink)" }}>
          {formatCountdown(left)}
        </span>
        <span style={{ fontSize: 13.5, lineHeight: 1.45 }}>
          {booking.state === "finding_again" ? "Your rider cancelled, so LyniaGo sent it out again. " : ""}
          Stay here to pick a rider. Offers appear as riders respond.
        </span>
      </div>

      {booking.offers.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "var(--muted)" }}>Waiting for riders' offers…</div>
      ) : (
        booking.offers.map((o) => (
          <div key={o.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{o.rider.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                {o.rider.ratingAvg != null ? `★ ${o.rider.ratingAvg.toFixed(1)} (${o.rider.ratingCount})` : "New rider"} · {o.rider.tripsCount} trips · {o.etaMinutes} min away
              </div>
              {o.ownMember && <div style={{ fontSize: 12.5, color: "var(--highlight-ink)", marginTop: 4 }}>On your team, so they can't take your own delivery.</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{money(o.offeredFare)}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{o.type === "accept" ? "your fare" : "their fare"}</div>
            </div>
            <button
              type="button"
              onClick={() => onPick(o)}
              disabled={disabled || o.ownMember}
              style={{ ...primaryButtonStyle, ...disabledStyle(disabled || o.ownMember) }}
              aria-label={`Pick ${o.rider.name} for ${money(o.offeredFare)}`}
            >
              {picking ? "Picking…" : "Pick"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function CodeCard({
  code,
  buyerPhone,
  message,
  copied,
  onCopy,
  onNewCode,
  rotating,
  disabled,
}: {
  code: string | null;
  buyerPhone: string;
  message: string;
  copied: boolean;
  onCopy: () => void;
  onNewCode: () => void;
  rotating: boolean;
  disabled: boolean;
}) {
  const wa = code ? whatsappLink(buyerPhone, message) : null;
  return (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Delivery code</div>
      {code ? (
        <>
          <div aria-label={`Delivery code ${code.split("").join(" ")}`} style={{ fontSize: 40, fontWeight: 800, letterSpacing: ".18em", fontVariantNumeric: "tabular-nums" }}>
            {code}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>
            The buyer gives this code to the rider at the door. That's how the delivery is confirmed.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" style={{ ...primaryButtonStyle, textDecoration: "none", display: "inline-block" }}>
                Send the code to the buyer on WhatsApp
              </a>
            )}
            <button type="button" onClick={onCopy} style={ghostButtonStyle}>
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>
          The code was shown to whoever picked the rider. Send a new one if the buyer doesn't have it: the old code stops working.
        </div>
      )}
      <button type="button" onClick={onNewCode} disabled={disabled} style={{ ...ghostButtonStyle, alignSelf: "flex-start", ...disabledStyle(disabled) }}>
        {rotating ? "Sending…" : code ? "Send a new code" : "Get a new code"}
      </button>
    </div>
  );
}

function RiderCard({ rider, fare }: { rider: NonNullable<MerchantBookingResponse["rider"]>; fare: string | null }) {
  return (
    <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{rider.name}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
          {rider.bikeReg ? `${rider.bikeReg} · ` : ""}Pay {money(fare)} in cash at pickup
        </div>
      </div>
      {rider.phone && (
        <a href={`tel:${rider.phone}`} style={{ ...ghostButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon name="phone" size={16} /> Call rider
        </a>
      )}
    </div>
  );
}

const bannerStyle: React.CSSProperties = { color: "var(--danger-ink)", background: "var(--danger-wash)", borderRadius: 10, padding: "10px 12px", fontSize: 13 };
const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 52,
  fontSize: 16,
  padding: "0 14px",
  borderRadius: "var(--radius-input)",
  border: "1.5px solid var(--line)",
  fontFamily: "inherit",
  background: "var(--bg)",
  color: "var(--ink)",
};
const backLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  minHeight: "var(--target-min)",
  color: "var(--accent-text)",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  alignSelf: "flex-start",
};
