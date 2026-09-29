"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isShortMapLink, type LatLng, type MerchantProfileResponse, parseMapLocation } from "@lynia/shared";
import { Kitchen } from "../../../components/Kitchen";
import { useKitchenConnection } from "../../../components/KitchenConnectionProvider";
import { Icon } from "../../../components/icons";
import { LocationPin } from "../../../components/LocationPin";
import { RetryableError } from "../../../components/RetryableError";
import { cardStyle, disabledStyle, primaryButtonStyle } from "../../../components/queue/styles";
import { ApiError, redirectIfSessionExpired } from "../../../lib/api-client";
import {
  type BookingErrors,
  type BookingForm,
  bookingsAvailable,
  DECLARED_VALUE_CAP,
  newIdempotencyKey,
  suggestedFare,
  toCreateRequest,
  validateBooking,
} from "../../../lib/booking";
import { createBooking, resolveMapLink } from "../../../lib/bookings-api";
import { primeBusiness } from "../../../lib/business";
import { getMerchantProfile } from "../../../lib/menu-api";
import { formatMoney } from "../../../lib/money-input";

type Gate = { status: "loading" } | { status: "ready"; business: MerchantProfileResponse; pickup: LatLng } | { status: "no_pin" } | { status: "error"; message: string };
type LinkStatus = { kind: "idle" } | { kind: "reading" } | { kind: "read" } | { kind: "unreadable"; message: string };

const UNREADABLE_LINK = "We couldn't read a location from that link. Drop a pin instead.";
/** A typed short link is resolved once typing stops; a paste lands whole, so it resolves right after. */
const RESOLVE_DELAY_MS = 400;

/** Send's liability terms, as the customer app shows them before a broadcast (DisclaimerSheet). */
const SEND_TERMS = [
  "Sending is at your own risk: if the order is lost, damaged or not delivered, LyniaGo isn't liable. You're hiring an independent rider.",
  "You agree the fare here and pay your rider cash at pickup. LyniaGo isn't involved in payment or any money dispute.",
  "LyniaGo connects you with a nearby rider. We don't carry, insure or guarantee the goods.",
];

/**
 * Book a rider (merchant web upgrade L2): every detail first, then "Find a rider", because Send's offer
 * window is 90 seconds from the broadcast. The pickup is always the business's own pin. The buyer's
 * location comes from the link they sent (read here, or by the API for a Google Maps short link) or a
 * pin the booker drags onto their door. Undrawn, ledgered as D-44.
 */
export default function NewBookingPage() {
  const router = useRouter();
  const { signOut, actionsDisabled } = useKitchenConnection();
  const [gate, setGate] = useState<Gate>({ status: "loading" });
  const [form, setForm] = useState<BookingForm>({
    point: { lat: 0, lng: 0 },
    pinConfirmed: false,
    landmark: "",
    buyerPhone: "",
    what: "",
    value: "",
    fare: "",
    note: "",
    accepted: false,
  });
  const [linkText, setLinkText] = useState("");
  const [link, setLink] = useState<LinkStatus>({ kind: "idle" });
  const [fareTouched, setFareTouched] = useState(false);
  const [errors, setErrors] = useState<BookingErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  // One key per form: a double tap, or a retry after a lost answer, books once (Send dedupes on it).
  const idempotencyKey = useRef(newIdempotencyKey());
  // Only the latest link counts: an older short link's answer arriving late never moves the pin.
  const linkSeq = useRef(0);
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (linkTimer.current) clearTimeout(linkTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    setGate({ status: "loading" });
    try {
      const business = await getMerchantProfile();
      primeBusiness(business);
      if (!bookingsAvailable(business)) {
        router.replace("/deliveries");
        return;
      }
      if (!business.location) {
        setGate({ status: "no_pin" });
        return;
      }
      setGate({ status: "ready", business, pickup: business.location.point });
      setForm((f) => (f.pinConfirmed ? f : { ...f, point: business.location!.point }));
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setGate({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load the booking form." });
    }
  }, [router, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const pickup = gate.status === "ready" ? gate.pickup : null;

  // The fare follows Send's suggestion for the trip until the booker types their own.
  useEffect(() => {
    if (!pickup || fareTouched || !form.pinConfirmed) return;
    setForm((f) => ({ ...f, fare: formatMoney(suggestedFare(pickup, f.point)) }));
  }, [pickup, form.point, form.pinConfirmed, fareTouched]);

  function update<K extends keyof BookingForm>(key: K, value: BookingForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function placePin(point: LatLng) {
    setForm((f) => ({ ...f, point, pinConfirmed: true }));
    setErrors((e) => ({ ...e, point: undefined }));
  }

  function readLink(text: string) {
    setLinkText(text);
    const seq = ++linkSeq.current;
    if (linkTimer.current) clearTimeout(linkTimer.current);
    if (!text.trim()) {
      setLink({ kind: "idle" });
      return;
    }
    const direct = parseMapLocation(text);
    if (direct) {
      placePin(direct);
      setLink({ kind: "read" });
      return;
    }
    const url = /https:\/\/\S+/i.exec(text)?.[0];
    if (url && isShortMapLink(url)) {
      setLink({ kind: "reading" });
      linkTimer.current = setTimeout(() => {
        resolveMapLink(url).then(
          (point) => {
            if (seq !== linkSeq.current) return;
            placePin(point);
            setLink({ kind: "read" });
          },
          (err: unknown) => {
            if (seq !== linkSeq.current || redirectIfSessionExpired(err, signOut)) return;
            setLink({ kind: "unreadable", message: err instanceof ApiError ? err.message : UNREADABLE_LINK });
          },
        );
      }, RESOLVE_DELAY_MS);
      return;
    }
    setLink({ kind: "unreadable", message: UNREADABLE_LINK });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    const found = validateBooking(form);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const booking = await createBooking(toCreateRequest(form, idempotencyKey.current));
      router.replace(`/deliveries/${booking.id}`);
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setBanner(err instanceof ApiError ? err.message : "Couldn't book a rider. Try again.");
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  const business = gate.status === "ready" ? gate.business : null;
  const pharmacy = business?.businessType === "shop" && business.shopKind === "pharmacy";

  return (
    <Kitchen active={business?.businessType === "shop" ? "deliveries" : "queue"}>
      <div className="kitchen-page" style={{ overflow: "auto", height: "100%" }}>
        <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}>
          <Link href="/deliveries" style={backLink}>
            <Icon name="chevron-left" size={16} /> Deliveries
          </Link>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>Book a rider</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
              Fill everything in first: riders have 90 seconds to offer once you send it.
            </div>
          </div>

          {gate.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading…</div>}
          {gate.status === "error" && <RetryableError message={gate.message} onRetry={() => void load()} />}
          {gate.status === "no_pin" && (
            <div style={{ ...cardStyle, fontSize: 14, lineHeight: 1.5 }}>
              <b>Your business has no pin yet.</b> Riders need it to find you. Message LyniaGo to set it.
            </div>
          )}

          {gate.status === "ready" && (
            <form onSubmit={submit} noValidate style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label htmlFor="buyer-link" style={labelStyle}>
                  Where is it going?
                </label>
                <div style={hintStyle}>Paste the location the buyer sent you, or drag the map until the pin is on their door.</div>
                <input
                  id="buyer-link"
                  value={linkText}
                  onChange={(e) => readLink(e.target.value)}
                  placeholder="Paste a Google Maps link or a WhatsApp location"
                  style={inputStyle}
                />
                {link.kind === "reading" && <div style={noteStyle}>Reading the link…</div>}
                {link.kind === "read" && <div style={{ ...noteStyle, color: "var(--accent-text)" }}>Got it. Check the pin below.</div>}
                {link.kind === "unreadable" && <div style={fieldErrorStyle}>{link.message}</div>}
                <div style={{ marginTop: 10 }}>
                  <LocationPin value={form.point} onMove={placePin} height={240} label="The buyer's door on the map. Use the arrow keys to move it." />
                </div>
                {errors.point && <div style={fieldErrorStyle}>{errors.point}</div>}
              </div>

              <Field id="landmark" label="What should the rider look for?" error={errors.landmark}>
                <input
                  id="landmark"
                  value={form.landmark}
                  onChange={(e) => update("landmark", e.target.value)}
                  maxLength={160}
                  placeholder="e.g. Blue gate opposite the church, 12 Fife Ave"
                  style={inputStyle}
                />
              </Field>

              <Field id="buyer-phone" label="Buyer's phone" hint="The rider calls this number at the door." error={errors.buyerPhone}>
                <input
                  id="buyer-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={form.buyerPhone}
                  onChange={(e) => update("buyerPhone", e.target.value)}
                  maxLength={20}
                  placeholder="0771234567"
                  style={inputStyle}
                />
              </Field>

              <Field id="what" label="What's going?" error={errors.what}>
                <input
                  id="what"
                  value={form.what}
                  onChange={(e) => update("what", e.target.value)}
                  maxLength={140}
                  placeholder="e.g. 2 brake pads and an oil filter"
                  style={inputStyle}
                />
              </Field>

              <Field
                id="value"
                label="What is it worth? (US$)"
                hint={`Up to $${DECLARED_VALUE_CAP}. It's the record of what the rider carried.`}
                error={errors.value}
              >
                <input id="value" inputMode="decimal" value={form.value} onChange={(e) => update("value", e.target.value)} placeholder="45" style={inputStyle} />
              </Field>

              <Field
                id="fare"
                label="Fare you offer (US$)"
                hint={
                  pickup && form.pinConfirmed
                    ? `Suggested fare $${formatMoney(suggestedFare(pickup, form.point))}. Riders may offer a different fare; you pay the rider you pick, in cash at pickup.`
                    : "Riders may offer a different fare; you pay the rider you pick, in cash at pickup."
                }
                error={errors.fare}
              >
                <input
                  id="fare"
                  inputMode="decimal"
                  value={form.fare}
                  onChange={(e) => {
                    setFareTouched(true);
                    update("fare", e.target.value);
                  }}
                  placeholder="3.50"
                  style={inputStyle}
                />
              </Field>

              <Field id="note" label="Note for the rider (optional)">
                <input
                  id="note"
                  value={form.note}
                  onChange={(e) => update("note", e.target.value)}
                  maxLength={280}
                  placeholder="e.g. Ask for Rudo at the counter"
                  style={inputStyle}
                />
              </Field>

              <div style={{ background: "var(--surface)", borderRadius: 12, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>How LyniaGo works</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  {SEND_TERMS.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                  <li>No prescription medicine, weapons, drugs or cash.{pharmacy ? " Over-the-counter items only." : ""}</li>
                  <li>No cash-on-delivery: the rider collects nothing from the buyer. The buyer pays you as they do today.</li>
                </ul>
              </div>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.45, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.accepted}
                  onChange={(e) => update("accepted", e.target.checked)}
                  style={{ width: 22, height: 22, margin: 0, flexShrink: 0, accentColor: "var(--cta-fill)" }}
                />
                <span>I understand and agree.</span>
              </label>
              {errors.accepted && <div style={fieldErrorStyle}>{errors.accepted}</div>}

              {banner && (
                <div role="alert" style={bannerStyle}>
                  {banner}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || actionsDisabled}
                style={{ ...primaryButtonStyle, height: "var(--target-primary)", padding: "0 16px", fontSize: 16, ...disabledStyle(busy || actionsDisabled) }}
              >
                {busy ? "Sending…" : "Find a rider"}
              </button>
            </form>
          )}
        </div>
      </div>
    </Kitchen>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {hint && <div style={hintStyle}>{hint}</div>}
      {children}
      {error && (
        <div role="alert" style={fieldErrorStyle}>
          {error}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 };
const hintStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--muted)", marginBottom: 8, lineHeight: 1.45 };
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
const noteStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--muted)", marginTop: 6 };
const fieldErrorStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--danger-ink)", marginTop: 6 };
const bannerStyle: React.CSSProperties = { color: "var(--danger-ink)", background: "var(--danger-wash)", borderRadius: 10, padding: "10px 12px", fontSize: 13 };
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
